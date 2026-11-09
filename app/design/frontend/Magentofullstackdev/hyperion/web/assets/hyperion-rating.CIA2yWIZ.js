var o=Object.defineProperty;var s=(e,t,r)=>t in e?o(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r;var i=(e,t,r)=>s(e,typeof t!="symbol"?t+"":t,r);import{i as a,a as l,b as c}from"./lit-element.CGWggwb8.js";class n extends a{render(){return c`<slot></slot>`}}i(n,"styles",l`
        :host {
            --rating-star-color: rgb(var(--color-accent));
            --rating-star-empty-color: rgb(var(--color-subtle));
            --rating-star-size: 1.5rem;
            display: inline-flex;
            flex-direction: row-reverse;
            justify-content: flex-end;
            gap: 2px;
        }

        ::slotted(input[type="radio"]) {
            position: absolute;
            opacity: 0;
            width: 1px;
            height: 1px;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
        }

        ::slotted(label) {
            cursor: pointer;
            width: var(--rating-star-size);
            height: var(--rating-star-size);
            color: var(--rating-star-empty-color);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: var(--rating-star-size);
            line-height: 1;
        }
    `);customElements.get("hyperion-rating")||customElements.define("hyperion-rating",n);export{n as HyperionRating};
//# sourceMappingURL=hyperion-rating.CIA2yWIZ.js.map
