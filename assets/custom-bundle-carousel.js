import { Component } from '@theme/component';
import { formatMoney } from '@theme/money-formatting';
import { CartLinesUpdateEvent, CartErrorEvent } from '@shopify/events';

const SUCCESS_MESSAGE_DISPLAY_DURATION = 5000;
const ERROR_MESSAGE_DISPLAY_DURATION = 10000;

class BundleCarouselComponent extends Component {
  #abortController = new AbortController();

  connectedCallback() {
    super.connectedCallback();

    this.#updateState();
    window.addEventListener('pageshow', this.#onPageShow, { signal: this.#abortController.signal });
  }

  #onPageShow = () => {
    this.#updateState();
  };

  get #checkboxes() {
    return Array.from(this.querySelectorAll('.bundle-carousel__select .checkbox__input'));
  }

  get #selectedCheckboxes() {
    return this.#checkboxes.filter((input) => input.checked);
  }

  get #maxItems() {
    return Math.max(1, Number(this.dataset.maxItems) || 1);
  }

  onSelectionChange() {
    this.#updateState();
  }

  toggleFromCard(event) {
    const origin = event.composedPath?.()[0] ?? event.target;
    if (!(origin instanceof Element)) return;
    if (origin.closest('a, .checkbox, .product-badges')) return;

    const card = event.target;
    const input = card.querySelector('.checkbox__input');
    if (!input || input.disabled) return;

    input.checked = !input.checked;
    this.#updateState();
  }

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

  #updateTotals(selected) {
    const { totalPrice, comparePrice, comparePriceAmount, savings } = this.refs;
    if (!totalPrice) return;

    const total = selected.reduce((sum, input) => {
      const item = input.closest('[data-bundle-item]');
      return sum + (Number(item?.dataset.price) || 0);
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

  #formatMoney(cents) {
    return formatMoney(cents, this.dataset.moneyFormat ?? '${{ amount }}', this.dataset.currency ?? 'USD');
  }

  #timeouts = [];

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#abortController.abort();
    this.#timeouts.forEach((id) => clearTimeout(id));
    this.#timeouts = [];
  }

  async addBundleToCart() {
    const { addButton } = this.refs;
    if (!addButton || addButton.hasAttribute('aria-busy')) return;

    const items = this.#selectedCheckboxes
      .map((input) => {
        const item = input.closest('[data-bundle-item]');
        if (!item || item.dataset.available !== 'true') return null;

        return {
          id: Number(item.dataset.variantId),
          quantity: 1,
          title: item.dataset.productTitle ?? '',
        };
      })
      .filter((item) => item !== null && Number.isFinite(item.id) && item.id > 0);

    if (items.length === 0) return;

    this.#startLoading();
    this.#hideError();

    const deferredEventPromise = CartLinesUpdateEvent.createPromise();

    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'add',
        context: 'product',
        lines: items.map((item) => ({ merchandiseId: String(item.id), quantity: item.quantity })),
        promise: deferredEventPromise.promise,
      })
    );

    try {
      const response = await fetch(Theme.routes.cart_add_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items: items.map(({ id, quantity }) => ({ id, quantity })),
          sections: this.#cartSectionIds().join(','),
        }),
      });
      const data = await response.json();

      let added = items;
      let failed = [];

      if (data.status) {
        ({ added, failed } = await this.#addItemsIndividually(items));
      }

      const cart = await this.#refreshCart();
      deferredEventPromise.resolve({
        cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
        detail: {
          items: cart.items,
          source: 'bundle-carousel-component',
          sourceId: this.id,
          itemCount: added.length,
          sections: data.sections,
          didError: failed.length > 0,
        },
      });

      if (added.length === 0) {
        this.dispatchEvent(
          new CartErrorEvent({ error: data.message || 'Add to cart failed', code: 'INVALID' })
        );
        this.#showError(this.dataset.textError ?? '');
        this.#finishLoading(false);
      } else {
        if (failed.length > 0) {
          const titles = failed.map((item) => item?.title).join(', ');
          this.#showError((this.dataset.textErrorPartial ?? '').replace('{{ titles }}', titles));
        }
        this.#announceAdded(added.length);
        this.#finishLoading(true);
      }
    } catch (error) {
      console.error(error);
      deferredEventPromise.reject(error);
      this.dispatchEvent(
        new CartErrorEvent({
          error: error instanceof Error ? error.message : 'Network error during add to cart',
          code: 'SERVICE_UNAVAILABLE',
        })
      );
      this.#showError(this.dataset.textError ?? '');
      this.#finishLoading(false);
    }
  }

  async #addItemsIndividually(items) {
    const results = await Promise.allSettled(
      items.map((item) =>
        fetch(Theme.routes.cart_add_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ items: [{ id: item?.id, quantity: item?.quantity }] }),
        })
          .then((response) => response.json())
          .then((data) => {
            if (data.status) throw new Error(data.message || 'Add to cart failed');
          })
      )
    );

    const added = [];
    const failed = [];
    results.forEach((result, index) => {
      (result.status === 'fulfilled' ? added : failed).push(items[index] ?? null);
    });

    return { added, failed };
  }

  async #refreshCart() {
    const cartItemsComponent = document.querySelector('cart-items-component');

    if (cartItemsComponent) {
      await customElements.whenDefined('cart-items-component');
      return cartItemsComponent.fetchCartData();
    }

    const response = await fetch(`${Theme.routes.cart_url}.json`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`Failed to fetch cart: ${response.status}`);
    return response.json();
  }

  #cartSectionIds() {
    return Array.from(document.querySelectorAll('cart-items-component'))
      .map((item) => (item instanceof HTMLElement ? item.dataset.sectionId : null))
      .filter((id) => typeof id === 'string');
  }

  #startLoading() {
    const { addButton, addButtonLabel } = this.refs;
    if (!addButton || !addButtonLabel) return;

    this.#defaultButtonLabel ??= addButtonLabel.textContent ?? '';
    addButton.disabled = true;
    addButton.setAttribute('aria-busy', 'true');
    addButtonLabel.textContent = this.dataset.textAdding ?? '';
  }

  #defaultButtonLabel = null;

  #finishLoading(success) {
    const { addButton, addButtonLabel } = this.refs;
    if (!addButton || !addButtonLabel) return;

    if (success) {
      addButtonLabel.textContent = this.dataset.textAdded ?? '';
      const timeoutId = setTimeout(() => {
        addButtonLabel.textContent = this.#defaultButtonLabel ?? '';
        addButton.removeAttribute('aria-busy');
        this.#updateState();
      }, 2000);
      this.#timeouts.push(timeoutId);
    } else {
      addButtonLabel.textContent = this.#defaultButtonLabel ?? '';
      addButton.removeAttribute('aria-busy');
      this.#updateState();
    }
  }

  #announceAdded(count) {
    const { liveRegion } = this.refs;
    if (!liveRegion) return;

    const template =
      count === 1 ? Theme.translations.items_added_to_cart_one : Theme.translations.items_added_to_cart_other;
    liveRegion.textContent = (template ?? '').replace('{{ count }}', String(count));

    const timeoutId = setTimeout(() => {
      liveRegion.textContent = '';
    }, SUCCESS_MESSAGE_DISPLAY_DURATION);
    this.#timeouts.push(timeoutId);
  }

  #showError(message) {
    const { errorMessage } = this.refs;
    if (!errorMessage) return;

    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');

    const timeoutId = setTimeout(() => {
      this.#hideError();
    }, ERROR_MESSAGE_DISPLAY_DURATION);
    this.#timeouts.push(timeoutId);
  }

  #hideError() {
    const { errorMessage } = this.refs;
    if (!errorMessage) return;

    errorMessage.textContent = '';
    errorMessage.classList.add('hidden');
  }
}

if (!customElements.get('bundle-carousel-component')) {
  customElements.define('bundle-carousel-component', BundleCarouselComponent);
}
