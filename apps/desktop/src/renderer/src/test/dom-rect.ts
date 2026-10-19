/** Geometry Interfaces subset needed by layout components in jsdom 20.
 * Bounds follow https://www.w3.org/TR/geometry-1/#DOMRect for negative sizes too.
 */
export class TestDOMRect {
  constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}

  static fromRect(rect: DOMRectInit = {}): TestDOMRect {
    return new TestDOMRect(rect.x, rect.y, rect.width, rect.height)
  }

  get top() { return Math.min(this.y, this.y + this.height) }
  get right() { return Math.max(this.x, this.x + this.width) }
  get bottom() { return Math.max(this.y, this.y + this.height) }
  get left() { return Math.min(this.x, this.x + this.width) }

  toJSON() {
    const { x, y, width, height, top, right, bottom, left } = this
    return { x, y, width, height, top, right, bottom, left }
  }
}
