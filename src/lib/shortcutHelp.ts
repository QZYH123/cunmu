/** Opens the ? shortcut help from anywhere (the search panel's foot hint). Its own module: Shortcuts and
 *  CommandPalette sit on an import cycle through Shell, so neither may import a value from the other. */
export const OPEN_HELP = 'cunmu:shortcut-help';
export const openShortcutHelp = () => window.dispatchEvent(new Event(OPEN_HELP));

/** another layer owns the keyboard while it's open (a sheet, the palette, a preview, a menu) */
export const layerOpen = () => typeof document !== 'undefined' && !!document.querySelector('.sheet, .palette-scrim, .preview-layer, .menu');
