#!/usr/bin/env node
// Install a verified complete package. Coordinate with Pi's proper-lockfile settings protocol.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agent = path.resolve(process.env.PI_AGENT_DIR || process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi/agent'));
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
if (manifest.name !== 'pi-notify-mac' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw Error('Invalid package identity');
const relative = `packages/pi-notify-mac/${manifest.version}`;
const destination = path.join(agent, relative);
const settingsFile = path.join(agent, 'settings.json');
const settingsLock = `${settingsFile}.lock`;
const token = randomUUID();
const scratch = path.join(agent, 'tmp', `pi-notify-install-${token}`);
const backup = path.join(agent, 'backups/pi-notify-mac', token);
const stagedSettings = path.join(agent, `.pi-notify-settings-${token}`);
const moved = [];
let installed = false, committed = false, lockStat, lockStarted;
const ownLock = () => {
  const current = fs.lstatSync(settingsLock, { throwIfNoEntry: false });
  return lockStat && current?.ino === lockStat.ino && current?.dev === lockStat.dev;
};
const checkLock = () => {
  // Pi's verified proper-lockfile default considers 10s-old leases stale. Keep this synchronous
  // critical section under 2s; never reclaim an existing/stale lock or remove a replacement lock.
  if (!ownLock() || Date.now() - lockStarted > 2000) throw Error('Settings lock ownership/deadline lost; no configuration committed');
  fs.utimesSync(settingsLock, new Date(), new Date());
};
try {
  fs.mkdirSync(scratch, { recursive: true, mode: 0o700 });
  for (const file of new Set(['package.json', 'LICENSE', ...(manifest.files ?? [])])) {
    if (typeof file !== 'string' || path.isAbsolute(file) || file.split('/').includes('..') || /[*?]/.test(file)) throw Error('Unsupported package file path');
    fs.mkdirSync(path.dirname(path.join(scratch, file)), { recursive: true });
    fs.cpSync(path.join(source, file), path.join(scratch, file), { recursive: true, errorOnExist: true });
  }
  const digest = root => {
    const hash = createHash('sha256');
    const visit = (directory, prefix = '') => {
      for (const name of fs.readdirSync(directory).sort()) {
        const file = path.join(directory, name), key = `${prefix}${name}`, stat = fs.lstatSync(file);
        if (stat.isDirectory()) visit(file, `${key}/`);
        else if (stat.isFile()) hash.update(key).update('\0').update(fs.readFileSync(file)).update('\0');
        else throw Error('Package must not contain links or special files');
      }
    };
    visit(root); return hash.digest('hex');
  };
  const packageSha256 = digest(scratch);
  // Pi 1.3.0 FileSettingsStorage uses proper-lockfile.lockSync(settingsFile,{realpath:false}),
  // whose acquisition is mkdir(settingsFile+'.lock'). All package staging precedes this lock.
  try { fs.mkdirSync(settingsLock); }
  catch (error) {
    if (error?.code === 'EEXIST') throw Error('Pi settings lock is already held; retry after the active writer finishes');
    throw error;
  }
  lockStat = fs.lstatSync(settingsLock); lockStarted = Date.now();
  const settingsStat = fs.lstatSync(settingsFile, { throwIfNoEntry: false });
  if (!settingsStat) throw Error('Local migration requires an existing settings.json; use official pi install for a fresh installation with no concurrent settings writers');
  if (!settingsStat.isFile()) throw Error('settings.json must be a regular file');
  const original = settingsStat ? fs.readFileSync(settingsFile) : undefined;
  let settings;
  try { settings = original ? JSON.parse(original.toString()) : {}; }
  catch { throw Error('Cannot parse settings.json; no configuration committed'); }
  if (!settings || Array.isArray(settings) || typeof settings !== 'object') throw Error('Invalid settings object');
  for (const name of ['packages', 'extensions']) {
    if (settings[name] !== undefined && !Array.isArray(settings[name])) throw Error(`Invalid ${name} declaration`);
  }
  const expand = value => path.resolve(agent, value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value);
  const legacyPaths = new Set(['approval-notify.ts', 'pi-notify-mac.ts'].map(name => path.join(agent, 'extensions', name)));
  const legacyExtension = value => typeof value === 'string' && legacyPaths.has(expand(value.replace(/^[+-]/, '')));
  const isNotify = item => {
    const value = typeof item === 'string' ? item : item?.source;
    if (typeof value !== 'string') throw Error('Invalid package source');
    if (/^(?:git:|https?:\/\/)?github\.com\/chenhaoxiang\/pi-notify-mac(?:\.git)?(?:@[^\s]+)?\/?$/.test(value) || /^npm:pi-notify-mac(?:@[^\s]+)?$/.test(value)) return true;
    if (/^[a-z]+:/.test(value)) return false;
    if (legacyExtension(value)) return true;
    try { return JSON.parse(fs.readFileSync(path.join(expand(value), 'package.json'), 'utf8')).name === 'pi-notify-mac'; }
    catch { return /^packages\/pi-notify-mac\//.test(value) || expand(value) === destination; }
  };
  const oldSources = (settings.packages ?? []).filter(isNotify);
  const filteredSources = oldSources.filter(item => typeof item === 'object');
  const filterIdentity = item => JSON.stringify({ ...item, source: undefined });
  if (new Set(filteredSources.map(filterIdentity)).size > 1) throw Error('Conflicting package resource filters; configuration preserved');
  const selected = filteredSources.length ? { ...filteredSources[0], source: relative } : relative;
  const next = { ...settings, packages: [...(settings.packages ?? []).filter(item => !isNotify(item)), selected] };
  if (settings.extensions) next.extensions = settings.extensions.filter(item => !legacyExtension(item));
  if (fs.existsSync(destination)) {
    if (fs.lstatSync(destination).isSymbolicLink() || digest(destination) !== packageSha256) throw Error('Installed version conflicts; refusing overwrite');
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.renameSync(scratch, destination); installed = true;
  }
  checkLock();
  const unchanged = () => {
    const current = fs.existsSync(settingsFile) ? fs.readFileSync(settingsFile) : undefined;
    return original ? !!current && original.equals(current) : current === undefined;
  };
  if (!unchanged()) throw Error('Settings changed outside the Pi lock; no configuration committed');
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
  if (original) fs.writeFileSync(path.join(backup, 'settings.json'), original, { mode: 0o600, flag: 'wx' });
  for (const oldPath of legacyPaths) {
    const stat = fs.lstatSync(oldPath, { throwIfNoEntry: false });
    if (!stat) continue;
    if (!stat.isFile() && !stat.isSymbolicLink()) throw Error('Legacy extension path is not a file');
    const saved = path.join(backup, path.basename(oldPath)); fs.renameSync(oldPath, saved); moved.push([oldPath, saved]);
  }
  fs.writeFileSync(stagedSettings, `${JSON.stringify(next, null, 2)}\n`, { mode: settingsStat ? settingsStat.mode & 0o777 : 0o600, flag: 'wx' });
  checkLock();
  if (!unchanged()) throw Error('Settings changed outside the Pi lock; legacy files will be restored');
  fs.renameSync(stagedSettings, settingsFile); committed = true;
  console.log(JSON.stringify({ version: manifest.version, packageSource: relative, packageSha256, backup, legacyFilesMoved: moved.length, sharedPiSettingsLock: true, restartRequired: true, forcedRestarts: 0 }));
} catch (error) {
  if (!committed) {
    for (const [oldPath, saved] of moved.reverse()) if (!fs.lstatSync(oldPath, { throwIfNoEntry: false })) fs.renameSync(saved, oldPath);
    if (installed) fs.rmSync(destination, { recursive: true, force: true });
  }
  throw error;
} finally {
  fs.rmSync(scratch, { recursive: true, force: true }); fs.rmSync(stagedSettings, { force: true });
  if (ownLock()) fs.rmdirSync(settingsLock);
}
