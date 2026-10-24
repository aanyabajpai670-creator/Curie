import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('curie', Object.freeze({ version: '0.1.0' }));
