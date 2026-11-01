const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('switcher', {
  list: () => ipcRenderer.invoke('list'),
  importCurrent: () => ipcRenderer.invoke('import-current'),
  activate: (id) => ipcRenderer.invoke('activate', id),
  remove: (id) => ipcRenderer.invoke('remove', id),
  usage: (id) => ipcRenderer.invoke('usage', id),
  quit: () => ipcRenderer.invoke('quit'),
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
});
