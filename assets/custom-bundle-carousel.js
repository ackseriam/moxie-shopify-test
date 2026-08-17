import { Component } from '@theme/component';
import { formatMoney } from '@theme/money-formatting';

/**
 * Bundle carousel: checkbox selection with a configurable limit and a live
 * client-side discount preview. The preview mirrors the automatic discount
 * the merchant configures in the Shopify admin — it never applies the real
 * discount itself (see README-custom-bundle-carousel.md).
 *
 * @typedef {object} BundleCarouselRefs
 * @property {HTMLButtonElement} [addButton] - The add-bundle-to-cart button.
 * @property {HTMLElement} [addButtonLabel] - The label inside the button.
 * @property {HTMLElement} [counter] - The "x of y selected" counter.
 * @property {HTMLElement} [totalPrice] - The (discounted) total price.
 * @property {HTMLElement} [comparePrice] - The strikethrough original total wrapper.
 * @property {HTMLElement} [comparePriceAmount] - The strikethrough amount text.
 * @property {HTMLElement} [savings] - The "you save X" message.
 * @property {HTMLElement} [maxMessage] - The limit-reached message.
 * @property {HTMLElement} [errorMessage] - The cart error message.
 * @property {HTMLElement} [liveRegion] - Screen reader announcements.
 *
 * @extends {Component<BundleCarouselRefs>}
 */
class BundleCarouselComponent extends Component {
  connectedCallback() {
    super.connectedCallback();

    this.#updateState();
  }

  /** @returns {HTMLInputElement[]} Checkboxes of selectable (in stock) products. */
  get #checkboxes() {
    return Array.from(this.querySelectorAll('.bundle-carousel__select .checkbox__input'));
  }

  /** @returns {HTMLInputElement[]} */
  get #selectedCheckboxes() {
    return this.#checkboxes.filter((input) => input.checked);
  }

  /** @returns {number} */
  get #maxItems() {
    return Math.max(1, Number(this.dataset.maxItems) || 1);
  }

  /**
   * Handles checkbox changes (delegated via on:change on the checkbox wrapper).
   */
  onSelectionChange() {
    this.#updateState();
  }

  /**
   * Makes the whole card toggle its checkbox, keeping the input as the single
   * source of truth. Clicks on the product link, the checkbox itself or the
   * badge keep their native behaviour.
   *
   * @param {Event} event - The click event (target proxied to the card).
   */
  toggleFromCard(event) {
    const origin = event.composedPath?.()[0] ?? event.target;
    if (!(origin instanceof Element)) return;
    if (origin.closest('a, .checkbox, .product-badges')) return;

    const card = /** @type {Element} */ (event.target);
    const input = /** @type {HTMLInputElement | null} */ (card.querySelector('.checkbox__input'));
    if (!input || input.disabled) return;

    input.checked = !input.checked;
    this.#updateState();
  }

  /**
   * Recomputes counter, limit locking, totals and CTA state from the DOM.
   */
  #updateState() {
    const checkboxes = this.#checkboxes;
    const selected = checkboxes.filter((input) => input.checked);
    const count = selected.length;
    const max = this.#maxItems;
    const limitReached = count >= max;

    for (const input of checkboxes) {
      const locked = limitReached && !input.checked;
      input.disabled = locked;
      input.setAttribute('aria-disabled', String(locked));
      input.closest('.checkbox')?.classList.toggle('checkbox--disabled', locked);
    }

    const { counter, maxMessage, addButton } = this.refs;

    if (counter) {
      counter.textContent = (this.dataset.textSelectedCount ?? '')
        .replace('{{ count }}', String(count))
        .replace('{{ max }}', String(max));
    }

    if (maxMessage) maxMessage.hidden = !limitReached;
    if (addButton && !addButton.hasAttribute('aria-busy')) addButton.disabled = count === 0;

    this.#updateTotals(selected);
  }

  /**
   * @param {HTMLInputElement[]} selected
   */
  #updateTotals(selected) {
    const { totalPrice, comparePrice, comparePriceAmount, savings } = this.refs;
    if (!totalPrice) return;

    const total = selected.reduce((sum, input) => {
      const item = input.closest('[data-bundle-item]');
      return sum + (Number(/** @type {HTMLElement | null} */ (item)?.dataset.price) || 0);
    }, 0);

    const percent = Number(this.dataset.discountPercentage) || 0;
    const minItems = Number(this.dataset.discountMinItems) || 0;
    const discountApplies = percent > 0 && selected.length >= minItems && selected.length > 0;
    const discountedTotal = discountApplies ? Math.round((total * (100 - percent)) / 100) : total;

    totalPrice.textContent = this.#formatMoney(discountedTotal);

    if (comparePrice) comparePrice.hidden = !discountApplies;
    if (comparePriceAmount && discountApplies) comparePriceAmount.textContent = this.#formatMoney(total);

    if (savings) {
      savings.hidden = !discountApplies;
      if (discountApplies) {
        savings.textContent = (this.dataset.textSavings ?? '')
          .replace('{{ amount }}', this.#formatMoney(total - discountedTotal))
          .replace('{{ percent }}', String(percent));
      }
    }
  }

  /**
   * @param {number} cents - Amount in minor units.
   * @returns {string}
   */
  #formatMoney(cents) {
    return formatMoney(cents, this.dataset.moneyFormat ?? '${{ amount }}', this.dataset.currency ?? 'USD');
  }
}

if (!customElements.get('bundle-carousel-component')) {
  customElements.define('bundle-carousel-component', BundleCarouselComponent);
}
