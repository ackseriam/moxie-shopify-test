import { Component } from '@theme/component';

/**
 * Bundle carousel: selection state, live discount preview and AJAX add-to-cart
 * arrive with the functionality phase. This stub registers the element so the
 * skeleton renders without console errors.
 *
 * @extends {Component}
 */
class BundleCarouselComponent extends Component {}

if (!customElements.get('bundle-carousel-component')) {
  customElements.define('bundle-carousel-component', BundleCarouselComponent);
}
