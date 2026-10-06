"""Isolated no-prompt Pi registration/RPC check; deny real notification transport."""
from pathlib import Path
import argparse,json,os,selectors,shlex,shutil,subprocess,tempfile,time

parser=argparse.ArgumentParser();parser.add_argument('--package',required=True);parser.add_argument('--out',default='tmp/verification/rpc-smoke.json');args=parser.parse_args()
package=Path(args.package).resolve();entry=(package/'src/pi-notify-mac.ts').resolve()
assert entry.is_file() and package in entry.parents
pi=shutil.which('pi');assert pi,'Pi CLI unavailable'
output=Path(args.out);output.parent.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='rpc-fixture-',dir=output.parent) as scratch:
 root=Path(scratch).resolve();agent=root/'agent';agent.mkdir();(root/'home').mkdir();bin_dir=root/'bin';bin_dir.mkdir()
 marker=root/'unexpected-transport'
 stub=bin_dir/'osascript';stub.write_text('#!/bin/sh\nprintf invoked > '+shlex.quote(str(marker))+'\nexit 1\n');stub.chmod(0o700)
 (agent/'settings.json').write_text(json.dumps({'defaultProvider':'fixture','defaultModel':'fixture','enableAnalytics':False,'enableInstallTelemetry':False,'cacheWarming':'off'}))
 (agent/'models.json').write_text(json.dumps({'providers':{'fixture':{'baseUrl':'http://127.0.0.1:9','api':'openai-completions','apiKey':'synthetic-not-a-credential','models':[{'id':'fixture','name':'fixture','reasoning':False,'input':['text'],'cost':{'input':0,'output':0,'cacheRead':0,'cacheWrite':0},'contextWindow':32768,'maxTokens':4096}]}}}))
 wrapper=root/'probe.ts'
 wrapper.write_text('import target from '+json.dumps(entry.as_uri())+';\nexport default function(pi){const names=[];const proxy=new Proxy(pi,{get(o,k){if(k==="on")return(...a)=>{names.push(a[0]);return o.on(...a)};return Reflect.get(o,k)}});target(proxy);const expected=["session_start","agent_start","session_shutdown","agent_settled"];if(JSON.stringify(names)!==JSON.stringify(expected))throw new Error("Unexpected registrations");pi.registerCommand("notify-fixture-proof",{description:"registered:"+names.join(","),handler:async()=>{}});}\n')
 env={'PATH':str(bin_dir)+os.pathsep+os.environ['PATH'],'HOME':str(root/'home'),'PI_CODING_AGENT_DIR':str(agent),'PI_CODING_AGENT_SESSION_DIR':str(root/'sessions'),'PI_SUBAGENTS_TEMP_ROOT':str(root/'synthetic-runs'),'TMPDIR':str(root),'PI_OFFLINE':'1','HINDSIGHT_HOOKS_DISABLED':'1','TERM':'dumb','LANG':'C.UTF-8'}
 commands=[{'id':'state','type':'get_state'},{'id':'commands','type':'get_commands'}]
 process=subprocess.Popen([pi,'--mode','rpc','--offline','--no-session','--no-tools','-ne','-ns','-np','-nc','--no-themes','-e',str(wrapper)],cwd=root,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 records=[];buffers={'out':b'','err':b''};stderr=b'';responses={};deadline=time.monotonic()+20
 sel=selectors.DefaultSelector();sel.register(process.stdout,selectors.EVENT_READ,'out');sel.register(process.stderr,selectors.EVENT_READ,'err')
 try:
  for command in commands:process.stdin.write(json.dumps(command).encode()+b'\n')
  process.stdin.flush()
  while time.monotonic()<deadline and len(responses)<2:
   for key,_ in sel.select(max(0,min(.5,deadline-time.monotonic()))):
    data=os.read(key.fileobj.fileno(),65536)
    if not data:sel.unregister(key.fileobj);continue
    if key.data=='err':stderr+=data;continue
    buffers['out']+=data
    while b'\n' in buffers['out']:
     line,buffers['out']=buffers['out'].split(b'\n',1)
     if not line.strip():continue
     value=json.loads(line);records.append(value)
     if value.get('type')=='response' and value.get('id') in ('state','commands'):responses[value['id']]=value
  assert len(responses)==2,'RPC response deadline/missing responses'
  assert all(value.get('success') is True for value in responses.values()),'RPC command failed'
  registered=responses['commands'].get('data',{}).get('commands',[])
  proof=next((c for c in registered if c.get('name')=='notify-fixture-proof'),None)
  assert proof and proof.get('description')=='registered:session_start,agent_start,session_shutdown,agent_settled','Factory registration proof missing'
  assert not marker.exists(),'Notification transport was invoked'
  assert not any(x.get('type') in ('message_start','agent_start') for x in records),'Unexpected model run'
  assert not buffers['out'].strip(),'Unexpected unterminated stdout'
  process.stdin.close();process.wait(timeout=10)
  assert process.returncode==0,'Pi startup/shutdown failed'
  assert not marker.exists(),'Notification transport was invoked during shutdown'
  result={'registrationProof':True,'events':['session_start','agent_start','session_shutdown','agent_settled'],'rpcCommands':['get_state','get_commands'],'successfulResponses':2,'modelPrompts':0,'notificationTransportInvocations':0,'personalConfigCopied':False,'isolatedAgentDirectory':True,'strictJSONL':True,'limitations':['registration/RPC framing only; not actual macOS delivery or hot-load proof']}
  output.write_text(json.dumps(result,indent=2)+'\n');output.chmod(0o600)
  print(json.dumps(result))
 except Exception:
  process.terminate()
  try:process.wait(timeout=5)
  except subprocess.TimeoutExpired:process.kill();process.wait()
  raise
 finally:sel.close()
