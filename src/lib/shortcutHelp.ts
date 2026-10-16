/** Opens the ? shortcut help from anywhere (the search panel's foot hint). Its own module: Shortcuts and
 *  CommandPalette sit on an import cycle through Shell, so neither may import a value from the other. */
export const OPEN_HELP = 'cunmu:shortcut-help';
export const openShortcutHelp = () => window.dispatchEvent(new Event(OPEN_HELP));
