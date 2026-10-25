# Pet window position and size audit

This audit covers the pet BrowserWindow. The debug overlay and study panel are separate windows and have their own placement calls.

## Position writers

| Call or trigger | Location | Source and owner |
| --- | --- | --- |
| BrowserWindow constructor receives `x` and `y` | `src/main/pet-window.js`, `createPetWindow` | Initial position comes from `PetPositionController.getPosition()`. The window stays hidden until the controller applies the restore and then it is shown. |
| `petWindow.setPosition(x, y)` | `src/main/main.js`, `makePetPositionController.apply` | The only post-construction pet position write. All writes pass through `PetPositionController` and are tagged `drag`, `wander`, `clamp`, or `restore`. |
| `ready-to-show` | `src/main/pet-window.js` | Calls controller `restore`; an old saved position is clamped against the union of display work areas before the window is shown. |
| `pet:drag-start`, `pet:drag-move`, `pet:drag-end`, `pet:drag-cancel` | preload, renderer pointer handlers, and `registerWindowControls` in `src/main/main.js` | Main captures the screen cursor at drag start and each move. The controller computes from the original pointer and window positions, clamps to display work areas, and persists only on drag end. Dragging suspends wander and restore/clamp updates. |
| 30 ms pet poll | `src/main/main.js`, `pollPet` | The main-process wander controller generates eased horizontal targets during airborne frames; `PetPositionController.wanderTo` owns the resulting writes. Target x positions stay in the central 60% roam strip; the position controller clamps only to work areas. CALM and dragging pause wander. |
| `display-added`, `display-removed`, `display-metrics-changed` | `src/main/main.js`, `refreshPetWorkAreas` | Updates the controller’s work-area union. The controller clamps the pet when it is not being dragged. |

## Size changes that can affect valid position

| Call or trigger | Location | Route |
| --- | --- | --- |
| `petWindow.setSize(width, height)` | `src/main/main.js`, `setPetScale` | Calls `PetPositionController.setSize` first so the new size is clamped to the display work-area union before resizing. |
| `petWindow.setSize(width, height)` | `src/main/main.js`, `applySettings` | Same route as pet size menu changes. |
| `pet:set-scale` | `src/main/preload.js` and `src/renderer/pet.js` | Changes renderer canvas size only; it does not place the native window. |
| Renderer `resize` event | `src/renderer/pet.js` | Resizes the canvas to the current scale; it does not write native window position or size. |

## Other windows and non-writers

- `src/main/debug-overlay-window.js` calls `overlay.setPosition` to keep the diagnostic overlay above the pet. It never moves the pet.
- `src/main/panel-window.js` calls `panel.setPosition` to place the panel beside the pet. It never moves the pet.
- `second-instance` and ready-to-show call `show()` only; they do not restore stored positions or resize the pet.
- The former `moved` debounce, close-time persistence, direct renderer delta writes, and `keepOnScreen` pet-window writer have been removed. Position persistence happens on drag end only.
