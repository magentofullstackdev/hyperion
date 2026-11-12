import{A as o,b as t}from"./lit-element.CGWggwb8.js";const p="#hyperion-notification";function $(e){return t`<input type="hidden" name="form_key" value=${e||""} />`}function y(){return t`<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
    </svg>`}const f="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-on-primary shadow-sm hover:bg-primary-hover hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary transition-all",h="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-subtle bg-surface px-2 py-2 text-xs font-medium text-muted hover:text-primary hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary transition-colors";function u(e,r,s,a,n={}){return t`<form action=${e} method="post" hx-post=${e} hx-target=${p}
                      hx-swap="outerHTML" hx-select=${p} hx-sync="this:drop" class=${n.class||"flex"}
                      hx-confirm=${n.confirm||o}>
        ${$(s)}
        ${Object.entries(r).map(([l,i])=>t`<input type="hidden" name=${l} value=${i} />`)}
        ${a}
    </form>`}function g(e,r){const s=r.labels||{},a=r.mode==="sidebar",n=r.mode==="list",l=r.showImage!==!1&&e.image?t`<a href=${e.url} class=${a?"block w-16 h-16 shrink-0 overflow-hidden rounded-lg bg-surface-raised":"block aspect-square overflow-hidden bg-surface-raised"+(n?" w-32 shrink-0 rounded-lg":"")} tabindex="-1" aria-hidden="true">
                <img src=${e.image} alt="" class="w-full h-full object-cover" loading="lazy" width="300" height="300" />
            </a>`:o,i=r.canCart&&e.saleable?e.buy_from_list?u(r.cartUrl,{product:e.id,qty:1},r.formKey,t`<button type="submit" data-hyperion-atc class=${f}>${y()}<span data-hyperion-atc-label>${s.cart||"Add to Cart"}</span><span data-hyperion-atc-busy aria-hidden="true">${s.adding||"Adding to cart..."}</span></button>`):t`<a href=${e.url} class=${f}>${s.options||"Select Options"}</a>`:o,d=r.wishlistEnabled?u(r.wishlistUrl,{product:e.id},r.formKey,t`<button type="submit" class=${h} title=${s.wishlist||"Add to Wish List"}>${s.wishlist||"Add to Wish List"}</button>`,{class:"flex-1"}):o,c=r.compareEnabled?u(r.compareUrl,{product:e.id},r.formKey,t`<button type="submit" class=${h} title=${s.compare||"Add to Compare"}>${s.compare||"Add to Compare"}</button>`,{class:"flex-1"}):o,m=i!==o||d!==o||c!==o||r.showMore?t`<div class="mt-auto pt-3 flex flex-col gap-2">
            ${i}
            ${d!==o||c!==o?t`<div class="flex items-center gap-2">${d}${c}</div>`:o}
            ${r.showMore?t`<a href=${e.url} class="text-xs font-medium text-primary hover:underline">${s.more||"Learn More"}</a>`:o}
        </div>`:o,b=t`<div class=${a?"min-w-0 flex-1 space-y-1":"p-4 space-y-2 flex-1 flex flex-col"}>
        ${r.showName!==!1?t`<a href=${e.url} class="block text-sm font-medium text-secondary hover:text-primary transition-colors line-clamp-2">${e.name}</a>`:o}
        ${r.showPrice!==!1&&e.price_formatted?t`<div class="text-sm font-bold text-secondary">${e.price_formatted}</div>`:o}
        ${m}
    </div>`;return t`<article class=${a?"flex gap-3 py-3 border-b border-subtle last:border-b-0":"group bg-surface rounded-xl border border-subtle overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all duration-200 flex "+(n?"flex-row gap-4 p-4":"flex-col")}
                     data-hyperion-product-id=${e.id}>
        ${l}
        ${b}
    </article>`}export{y as c,$ as f,g as r,u as t};
//# sourceMappingURL=product-card.BIFOGOGi.js.map
