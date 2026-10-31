/**
 * Espaçamento único das superfícies flutuantes (menus, submenus, selects e listas de comando).
 * A superfície mantém 6px até a borda e cada item mais 10px na horizontal, para que o realce
 * nunca encoste no contorno em Light ou Dark. Raio do item: 16px da superfície − 6px de recuo = 10px.
 */
export const MENU_SURFACE_INSET_CLASS = "p-1.5";

export const MENU_SURFACE_CLASS = `z-[1200] min-w-32 overflow-hidden rounded-lg border border-border bg-popover shadow-[0_4px_16px_0_rgb(0_0_0/0.08),0_0_24px_0_rgb(0_0_0/0.04)] ${MENU_SURFACE_INSET_CLASS} text-popover-foreground`;

export const MENU_ITEM_CLASS =
  "relative flex cursor-default select-none items-center rounded-[10px] py-1.5 text-sm outline-hidden data-disabled:pointer-events-none data-disabled:opacity-50 focus:bg-accent focus:text-accent-foreground";
