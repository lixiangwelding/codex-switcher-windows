const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('switcher', {
  list: () => ipcRenderer.invoke('list'),
  importCurrent: () => ipcRenderer.invoke('import-current'),
  activate: (id) => ipcRenderer.invoke('activate', id),
  remove: (id) => ipcRenderer.invoke('remove', id),
  usage: (id) => ipcRenderer.invoke('usage', id),
  quit: () => ipcRenderer.invoke('quit'),
  addAccount: () => ipcRenderer.invoke('add-account'),
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
  loginStart: () => ipcRenderer.invoke('login-start'),
  loginCancel: () => ipcRenderer.invoke('login-cancel'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onLoginOutput: (cb) => ipcRenderer.on('login-output', (_e, text) => cb(text)),
  onLoginDone: (cb) => ipcRenderer.on('login-done', (_e, summary) => cb(summary)),
});
