# Sección `custom-bundle-carousel`

Carrusel de bundle para el tema **Horizon**: el comerciante elige hasta 10 productos desde el editor del tema, el cliente selecciona con checkboxes (con límite configurable), ve el descuento reflejado en vivo y añade todo el bundle al carrito vía AJAX (`/cart/add.js`) sin recargar la página.

Diseño implementado 1:1 desde Figma — nodos `336:7491` (desktop) y `336:7031` (móvil) del archivo *Luxe Fine Jewelers*, extraídos con el MCP de Figma.

---

## Configuración en el Theme Customizer

**Añadir la sección:** editor del tema → *Add section* → **Bundle carousel** (categoría Products). El preset trae 3 bloques de producto vacíos.

### Bloques

| Bloque | Qué hace |
|---|---|
| **Product** (hasta 10) | Cada bloque tiene un picker de producto nativo. Añade/quita/reordena bloques para componer el bundle. |

### Settings

| Setting | Qué hace | Default |
|---|---|---|
| Title / Subtitle | Título y subtítulo de la sección | "Build your bundle" / "Pick your favorites and save" |
| Maximum products per bundle | Límite de selección simultánea. Al alcanzarlo, los checkboxes restantes se deshabilitan (visual + `aria-disabled`) con mensaje explicativo. **Puede sobrescribirse con el metafield de tienda `custom.bundle_max_items`** (ver abajo) | 3 |
| Bundle discount (%) | Porcentaje que la UI previsualiza (precio tachado + "Ahorras $X"). **No aplica el descuento real** (ver "Descuento automático") | 15% |
| Minimum products for discount | Nº de seleccionados a partir del cual la previsualización aplica el % | 2 |
| Button label | Texto del CTA | "Add bundle to cart" |
| Columns / Mobile cards | 3–4 columnas en desktop, 1–2 tarjetas en móvil | 4 / 2 |
| Horizontal gap | Separación entre tarjetas en desktop (móvil fija 10px por spec de Figma) | 20px |
| Card background | Fondo de la imagen de producto (Figma: `#FAFAFA` con `mix-blend-multiply`) | `#FAFAFA` |
| Navigation icon/background | Flechas del carrusel (componente slideshow nativo de Horizon) | Arrow / None |
| Width, Gap, Color scheme, Padding | Settings estándar de sección de Horizon | page-width / 20 / scheme-1 / 40-40 |

Todo es editable en vivo con preview reactivo; no hay valores hardcodeados que requieran tocar código.

### Metafield `custom.bundle_max_items`

Definición sugerida (Admin → Settings → Custom data → Shop): tipo *Integer*, namespace/key `custom.bundle_max_items`.

**Prioridad: el metafield sobrescribe al setting del customizer cuando está definido.** Motivo: permite gestión centralizada vía Admin API o apps sin tocar cada instancia de la sección. Si está vacío, manda el setting.

---

## Descuento automático (obligatorio configurar en Admin)

El JS de la sección **solo previsualiza** el descuento para UX. El descuento real lo aplica Shopify en carrito/checkout mediante un **Automatic Discount** que debe crearse en Admin → Discounts:

- **Tipo:** *Amount off products* → automático.
- **Condición:** cantidad mínima de items (ej. "compra mínima de 2 artículos" restringido a los productos/colección del bundle).
- **Valor:** el mismo % configurado en el setting *Bundle discount* (ej. 15%).

> Alternativa más robusta: una Discount Function (Shopify Functions) que aplique el % cuando el carrito contiene ≥ N productos del set del bundle — fuera del alcance de esta prueba.

**Edge case conocido (documentado, no resuelto por diseño):** si el admin cambia el % en el customizer pero no actualiza el automatic discount (o viceversa), la UI y el checkout se desincronizan. El setting incluye un `info` recordándolo.

---

## Qué se reutilizó de Horizon vs qué se construyó

### Reutilizado (y por qué)

| Pieza | Origen | Uso |
|---|---|---|
| Carrusel | `snippets/resource-list-carousel.liquid` + `snippets/slideshow*.liquid` + `assets/slideshow.js` | Carrusel nativo del tema (scroll-snap + flechas accesibles + teclado). **No se añadió ninguna librería** (Swiper/Slick): el slideshow de Horizon ya es ligero y consistente con el resto del sitio |
| Wrapper de lista | Clases/vars de `snippets/resource-list.liquid` (`--column-count`, `--resource-list-column-gap-desktop`, `--mobile-card-size`) + `resource-list-styles` | Mismo sistema de columnas que product-list/collection-list. Se replica el wrapper porque el snippet `resource-list` exige `settings.layout_type` y esta sección es carrusel fijo |
| Checkbox | `snippets/checkbox.liquid` (+ `checkbox-styles`) | Input accesible con `<label>` asociado e ícono de check del tema |
| Precio | `snippets/price.liquid` | Respeta `compare_at_price`, multi-moneda y traducciones igual que el resto del sitio |
| Imagen | `snippets/image.liquid` | `image_tag` con srcset 1x/2x/3x |
| Badge "Agotado" | Markup de `blocks/_product-card-gallery.liquid` + `snippets/product-badges-styles.liquid` | Mismo badge (posición/radio/tipografía de los settings globales del tema) que las tarjetas nativas |
| Botón CTA | Clase global `.button` | Sin CSS de botón por sección (convención del proyecto) |
| Formato de moneda en JS | `assets/money-formatting.js` (`formatMoney`) | Replica el filtro `money` de Liquid client-side |
| Patrón AJAX cart | `assets/product-form.js` (referencia) | Mismo contrato: `Theme.routes.cart_add_url`, `CartLinesUpdateEvent` con promesa diferida (actualiza drawer + ícono), `CartErrorEvent`, refresh vía `cart-items-component.fetchCartData()` o `/cart.js` |
| Framework JS | `@theme/component` (`Component`, refs, `on:` delegation) | Ciclo de vida y binding declarativo estándar del tema |
| Layout de sección | `section-background`, `spacing-style`, `gap-style`, `color_scheme`, `section--{width}` | Idéntico a las secciones vecinas |

### Construido desde cero (y por qué)

| Pieza | Motivo |
|---|---|
| La sección con **blocks locales** tipo `product` (`limit`/`max_blocks: 10`) | Requisito del ticket. `product-list` (lo más cercano) es por colección, sin picker por producto ni lógica de bundle. Los blocks locales se iteran con `{% for block in section.blocks %}` + `block.shopify_attributes` porque `{% content_for 'blocks' %}` solo renderiza *theme blocks* (archivos de `blocks/`), que no admiten `limit` por tipo |
| Tarjeta de producto propia (`bundle-carousel__card`) | La tarjeta nativa `_product-card` es un static theme block (no mezclable con blocks locales en la misma sección) y arrastra quick-add/swatches que el diseño no tiene. La tarjeta propia reusa image/price/badge y añade los `data-*` (variant, precio en centavos, stock) que necesita el JS |
| `assets/custom-bundle-carousel.js` | Lógica de bundle inexistente en el tema: selección con límite, previsualización de descuento, batch add con fallback por item |

**Decisión de carrusel (deseable #3):** nativo — el slideshow de Horizon usa CSS scroll-snap con JS mínimo ya cargado por el tema; una librería externa duplicaría peso y rompería la consistencia visual/accesible.

**Manejo de errores de Cart API (deseable #2):** los agotados se excluyen del payload desde Liquid/JS (la petición nunca falla por un producto agotado configurado). Si Shopify rechaza el batch (ej. stock cambió tras el render), se reintenta **por item con `Promise.allSettled`**: lo que se pudo añadir entra al carrito y se informa qué productos fallaron, sin romper el resto.

---

## Accesibilidad

- Checkboxes reales con `<label>` (snippet del tema); texto de label visualmente oculto, anuncio "Add {producto} to bundle".
- Límite alcanzado: `disabled` + `aria-disabled` + mensaje visible.
- Resumen (contador/precios) en contenedor `aria-live="polite"`; resultado del add-to-cart anunciado en región `aria-live="assertive"` (`role="status"`); errores con `role="alert"`.
- CTA con `aria-busy` durante la carga y texto "Adding…".
- Carrusel: flechas y teclado del componente slideshow de Horizon; `prefers-reduced-motion` respetado por el tema (scroll-snap sin animaciones propias).
- Toda la tarjeta es clickeable para seleccionar, con el checkbox como única fuente de verdad (los clicks en link/checkbox conservan su comportamiento nativo).

## Estados cubiertos

- 0 productos (editor): mensaje de onboarding, sin errores de Liquid. En storefront no se pinta la lista.
- Bloques sin producto elegido: tarjeta placeholder (SVG del tema + título placeholder).
- Producto agotado: badge "Agotado" del tema, sin checkbox, excluido del payload, media al 60% de opacidad.
- 1–10 productos, límite alcanzado, error simulado de Cart API (batch → fallback por item).

## Limitaciones conocidas / pendientes

- **Tipografías globales:** el tema tiene Inter configurado; el Figma usa Cambon (headings) y DM Sans (body). El CSS usa los roles del tema (`--font-heading--family`, `--font-body--family`) con los tamaños/line-heights exactos del Figma, así que basta cambiar las fuentes globales del tema para igualar la familia (Cambon no está en la librería de fuentes de Shopify; requeriría fuente custom).
- **Colores exactos del Figma sin variable del tema** (`#030303`, `rgba(3,3,3,0.8)`): hardcodeados con comentario del nodo, según la convención del proyecto (sin prefijo de tokens propio todavía).
- **Padding móvil 50px / gap 24px / gutter 10px:** el spec de Figma difiere del desktop y los settings de padding de Horizon no son por-breakpoint; se resuelve con media query documentada en el CSS de la sección.
- La selección del cliente se resetea si el comerciante cambia un setting en el editor (re-render de la sección) — comportamiento estándar de Horizon.
- Si el mismo producto se añade en dos bloques, se comporta como dos líneas independientes (responsabilidad del comerciante).
- El descuento previsualizado es plano (un solo %); descuentos escalonados serían una extensión del mismo mecanismo (tiers en settings + lógica en `#updateTotals`).

## Proceso / QA

Se usaron los skills del proyecto (`.claude/skills/`): `build-section` para el flujo Figma→spec→mapeo→build, y los checkpoints de QA con `qa-markup` (construcción/ladder), `qa-design` (fidelidad vs Figma) y `qa-function` (comportamiento en navegador). `theme check` en verde para los archivos de la sección (3 warnings `ValidScopedCSSClass` por reutilizar las clases del snippet compartido `product-badges-styles`, mismo patrón que `_product-card-gallery` del tema).
