type AttributeValue = string | number | boolean | null | undefined;

export interface ElementOptions {
  class?: string;
  text?: string;
  attrs?: Record<string, AttributeValue>;
}

/**
 * Builds an element without innerHTML, so Quran text and user input can never be
 * interpreted as markup. `true` attrs become bare attributes; falsy ones are
 * skipped so callers can pass conditional values directly.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;

  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }

  if (children.length > 0) node.append(...children);
  return node;
}
