// ============================================================================
// PicoClaw DOM Utilities
// ============================================================================

/**
 * Create an element with optional classes, attributes, and children.
 */
export function el(tag, opts = {}, ...children) {
  const element = document.createElement(tag);

  if (opts.className) element.className = opts.className;
  if (opts.id) element.id = opts.id;

  if (opts.attrs) {
    for (const [key, val] of Object.entries(opts.attrs)) {
      element.setAttribute(key, val);
    }
  }

  if (opts.style) {
    Object.assign(element.style, opts.style);
  }

  if (opts.on) {
    for (const [event, handler] of Object.entries(opts.on)) {
      element.addEventListener(event, handler);
    }
  }

  if (opts.dataset) {
    for (const [key, val] of Object.entries(opts.dataset)) {
      element.dataset[key] = val;
    }
  }

  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  }

  return element;
}

/**
 * Set innerHTML safely and return the container.
 */
export function html(container, markup) {
  if (typeof container === 'string') {
    container = document.getElementById(container);
  }
  if (container) {
    container.innerHTML = markup;
  }
  return container;
}

/**
 * Shortcut for getElementById.
 */
export function $(id) {
  return document.getElementById(id);
}

/**
 * Clear all children of an element.
 */
export function clear(element) {
  if (typeof element === 'string') element = document.getElementById(element);
  if (element) element.innerHTML = '';
  return element;
}

/**
 * Toggle a CSS class.
 */
export function toggleClass(element, className, force) {
  if (typeof element === 'string') element = document.getElementById(element);
  if (element) element.classList.toggle(className, force);
}

/**
 * Create an image element that hides itself on error.
 */
export function img(src, alt = '', className = '') {
  const image = el('img', {
    className,
    attrs: { src, alt },
    on: { error: (e) => { e.target.style.display = 'none'; } },
  });
  return image;
}
