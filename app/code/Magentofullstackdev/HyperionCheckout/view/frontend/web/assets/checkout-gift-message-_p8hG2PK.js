import{r as C}from"./checkout-app-B6LQaPKQ.js";import{e as N,i as P,f as M,t as u,g as _,a as O,b as w,A as D,c as h}from"./checkout-bfdIjziR.js";var W=Object.defineProperty,I=Object.getOwnPropertyDescriptor,G=t=>{throw TypeError(t)},F=(t,e,s,i)=>{for(var r=I(e,s),o=t.length-1,n;o>=0;o--)(n=t[o])&&(r=n(e,s,r)||r);return r&&W(e,s,r),r},L=(t,e,s)=>e.has(t)||G("Cannot "+s),g=(t,e,s)=>(L(t,e,"read from private field"),s?s.call(t):e.get(t)),p=(t,e,s)=>e.has(t)?G("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(t):e.set(t,s),m=(t,e,s,i)=>(L(t,e,"write to private field"),e.set(t,s),s),b,$,x,k;const T=2e3;function v(t){return t===null?"order":String(t)}function S(t){return t==="order"?null:Number(t)}function l(t){return{sender:t.sender.trim(),recipient:t.recipient.trim(),message:t.message.trim().slice(0,T)}}function y(t,e){return t.sender===e.sender&&t.recipient===e.recipient&&t.message===e.message}function E(t){return!t||t===!0?{sender:"",recipient:"",message:""}:{sender:typeof t.sender=="string"?t.sender:"",recipient:typeof t.recipient=="string"?t.recipient:"",message:typeof t.message=="string"?t.message:""}}function H(t,e){const s=t.isOrderLevelGiftOptionsEnabled===!0?E(t.giftMessage?.orderLevel):null,i=t.giftMessage?.itemLevel,r=i&&i!==!0?i:{},o=t.isItemLevelGiftOptionsEnabled===!0?e.filter(n=>n.is_virtual==="1"||n.is_virtual===1||n.is_virtual===!0?!1:r[String(n.item_id)]?.is_available!==!1).map(n=>({item:n,state:E(r[String(n.item_id)]?.message)})):[];return{order:s,items:o}}class f extends N(P){constructor(){super(...arguments),p(this,b,!1),p(this,$,{}),p(this,x,{}),p(this,k,{}),this._stored={},this._sending={},this._unregisterFlusher=null,this._flushDirtyForms=()=>{for(const[e,s]of Object.entries(this._forms))this._isDirty(e)&&this._save(S(e),s)},this._save=async(e,s)=>{const i=v(e),r=l(s);this._busy={...this._busy,[i]:!0},this._sending[i]=r;const o=await M().saveGiftMessage(e,r);if(this._sending[i]===r&&delete this._sending[i],this._busy={...this._busy,[i]:!1},o.status!=="superseded"){if(o.status==="applied"){this._stored[i]=r;const n=this._forms[i];(n===void 0||y(l(n),r))&&this._forgetDraft(i),this._notice={...this._notice,[i]:{tone:"success",text:r.message===""?u("Hyperion_Checkout::gift_removed"):u("Hyperion_Checkout::gift_saved")}};return}o.status!=="failed"&&(this._notice={...this._notice,[i]:{tone:"error",text:u("Hyperion_Checkout::gift_save_failed")}})}}}get _open(){return g(this,b)}set _open(e){m(this,b,e)}get _forms(){return g(this,$)}set _forms(e){m(this,$,e)}get _busy(){return g(this,x)}set _busy(e){m(this,x,e)}get _notice(){return g(this,k)}set _notice(e){m(this,k,e)}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this._unregisterFlusher=M().queue.registerFlusher(this._flushDirtyForms),this._restoreDrafts()}_restoreDrafts(){const e=_.get();if(Object.keys(e).length===0)return;const s=H(w(),O().items.get()),i={};s.order!==null&&(i[v(null)]=s.order);for(const{item:n,state:a}of s.items)i[v(Number(n.item_id))]=a;const r={...this._forms};let o=!1;for(const[n,a]of Object.entries(e)){const c=i[n];if(c===void 0||r[n]!==void 0)continue;const d={sender:a.sender,recipient:a.recipient,message:a.message};y(l(d),l(c))||(this._stored[n]=l(c),r[n]=d,o=!0)}o&&(this._forms=r,this._open=!0)}_forgetDraft(e){const s=_.get();if(!(e in s))return;const{[e]:i,...r}=s;_.set(r)}disconnectedCallback(){super.disconnectedCallback(),this._unregisterFlusher?.(),this._unregisterFlusher=null}_hasTargets(){const e=H(w(),O().items.get());return e.order!==null||e.items.length>0}updated(){const e=!this._hasTargets();this.toggleAttribute("hidden",e),this.classList.toggle("hc-host",!e)}_isDirty(e){const s=this._forms[e],i=this._stored[e];if(s===void 0||i===void 0)return!1;const r=l(s),o=this._sending[e];return o!==void 0&&y(r,o)?!1:!y(r,i)}_onFormFocusOut(e,s){const i=s.currentTarget,r=s.relatedTarget;if(i!==null&&r instanceof Node&&i.contains(r))return;const o=this._forms[e];o!==void 0&&this._isDirty(e)&&this._save(S(e),o)}render(){const e=w(),s=H(e,O().items.get());return s.order===null&&s.items.length===0?D:this._open?h`
            <div class="space-y-4" data-hyperion-gift-options>
                ${s.order!==null?this._renderForm(null,u("Hyperion_Checkout::gift_order_heading"),s.order):D}
                ${s.items.map(({item:i,state:r})=>this._renderForm(Number(i.item_id),u("Hyperion_Checkout::gift_item_heading",{name:i.name}),r))}
                <hc-section-status section="gift"></hc-section-status>
                <button type="button"
                        class="text-sm font-medium text-muted hover:underline"
                        @click=${()=>{this._open=!1}}>
                    ${u("Hyperion_Checkout::gift_options_close")}
                </button>
            </div>
        `:h`
                <button type="button"
                        class="text-sm font-medium text-accent hover:underline"
                        data-hyperion-gift-open
                        @click=${()=>{this._open=!0}}>
                    ${u("Hyperion_Checkout::gift_options_open")}
                </button>
            `}_renderForm(e,s,i){const r=v(e),o=this._forms[r]??i,n=this._notice[r],a=(c,d)=>h`
            <hc-text-input
                label=${d}
                name=${`gift_${r}_${c}`}
                .value=${o[c]}
                @value-change=${A=>this._update(r,i,c,A.detail.value)}
            ></hc-text-input>
        `;return h`
            <fieldset class="rounded-lg border border-subtle p-3"
                      data-hyperion-gift-form=${r}
                      @focusout=${c=>this._onFormFocusOut(r,c)}>
                <legend class="px-1 text-sm font-semibold text-brand">${s}</legend>
                <div class="hc-field-row hc-field-row-2">
                    ${a("sender",u("Hyperion_Checkout::gift_sender_label"))}
                    ${a("recipient",u("Hyperion_Checkout::gift_recipient_label"))}
                </div>
                <label class="mt-4 block">
                    <span class="hc-field-label text-brand">${u("Hyperion_Checkout::gift_message_label")}</span>
                    <textarea
                        name=${`gift_${r}_message`}
                        rows="3"
                        maxlength=${String(T)}
                        class="mt-1.5 block w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-sm text-brand focus:outline-none focus:ring-2 focus:ring-accent"
                        .value=${o.message}
                        @input=${c=>this._update(r,i,"message",c.target.value)}
                    ></textarea>
                </label>
                <p class="hc-field-message ${n?.tone==="error"?"text-danger":"text-success-strong"}"
                   role="status"
                   data-hyperion-gift-notice=${n?.tone??"none"}>${n?n.text:D}</p>
                <div class="mt-2 flex gap-2">
                    <hc-button variant="secondary"
                               .label=${u("Hyperion_Checkout::gift_save")}
                               .loading=${this._busy[r]===!0}
                               @click=${()=>this._save(e,o)}></hc-button>
                </div>
            </fieldset>
        `}_update(e,s,i,r){const o=this._forms[e]??s;this._stored[e]??=l(s);const n={...o,[i]:r};if(this._forms={...this._forms,[e]:n},_.set({..._.get(),[e]:n}),this._notice[e]){const a={...this._notice};delete a[e],this._notice=a}}}b=new WeakMap;$=new WeakMap;x=new WeakMap;k=new WeakMap;F([C()],f.prototype,"_open");F([C()],f.prototype,"_forms");F([C()],f.prototype,"_busy");F([C()],f.prototype,"_notice");customElements.get("checkout-gift-message")||customElements.define("checkout-gift-message",f);export{f as CheckoutGiftMessage,H as resolveGiftMessageTargets};
//# sourceMappingURL=checkout-gift-message-_p8hG2PK.js.map
