
class TextDisplay extends HTMLElement {

  constructor() {
    super();
    this.title = ''
    this.unit = ''
    this._value = '--'
  }

  static get observedAttributes() {
    return ['title', 'unit', 'value']
  }

  get value() {
    return this._value
  }

  set value(newValue) {
    this._value = newValue
    this.connectedCallback()
  }

  attributeChangedCallback(property, oldValue, newValue) {
    if (oldValue === newValue) {
      return
    }
    this[property] = newValue
  }

  connectedCallback() {
    this.innerHTML = `<header class="display__title"><h4>${this.title}</h4></header>
<span class="display__value">${this.value}</span>
<span class="display__unit">${this.unit}</span>`
  }
}

customElements.define('text-display', TextDisplay)
