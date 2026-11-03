// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Sergiu Ro -- magentofullstackdev

// Hyperion Mega Menu builder (admin, "Manage Items").
//
// A plain ES module, no RequireJS, no jQuery: the tree is rendered from the
// JSON of the `tree` endpoint, every change (drag and drop, save, delete,
// import) is a fetch() whose answer carries the fresh tree, and the item
// form is an HTML fragment of the `form` endpoint (server rendered with the
// admin classes, so it follows the admin theme). Drag and drop is native
// HTML5: a row dropped on the top third of another row goes before it, on
// the bottom third after it, in the middle inside it (one level deeper);
// a store view may only reorder siblings.

const config = JSON.parse(document.getElementById('hyperion-megamenu-config').textContent);
const root = document.querySelector('[data-hyperion-megamenu-builder]');
const treeHost = root.querySelector('[data-hmm-tree]');
const inspector = root.querySelector('[data-hmm-inspector]');
const formTitle = root.querySelector('[data-hmm-form-title]');
const messages = root.querySelector('[data-hmm-messages]');

const state = { nodes: [], byId: new Map(), selectedId: 0, collapsed: new Set(), dragId: 0 };
const structureEditable = config.storeId === 0;

const svg = (path) => `<svg class="hmm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const ICON_HANDLE = svg('<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>');
const ICON_CARET = svg('<path d="M9 6l6 6-6 6"/>');

function showMessage(text, type = 'success') {
    messages.replaceChildren();
    if (!text) return;
    const wrap = document.createElement('div');
    wrap.className = `messages`;
    const msg = document.createElement('div');
    msg.className = `message message-${type} ${type}`;
    msg.setAttribute('role', type === 'error' ? 'alert' : 'status');
    msg.textContent = text;
    wrap.appendChild(msg);
    messages.appendChild(wrap);
    if (type !== 'error') setTimeout(() => { if (messages.contains(wrap)) wrap.remove(); }, 4000);
}

async function request(url, body) {
    const data = new URLSearchParams();
    data.set('form_key', config.formKey);
    data.set('isAjax', 'true');
    for (const [key, value] of Object.entries(body || {})) {
        if (Array.isArray(value)) value.forEach((v) => data.append(key + '[]', v));
        else data.set(key, value);
    }
    const response = await fetch(url, { method: 'POST', body: data, credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    if (!response.ok) throw new Error(config.labels.network);
    return response.json();
}

function index(nodes, parentId = 0) {
    for (const node of nodes) {
        node.parent_id = parentId;
        state.byId.set(node.id, node);
        index(node.children, node.id);
    }
}

function setTree(tree) {
    state.nodes = tree?.nodes || [];
    state.byId = new Map();
    index(state.nodes);
    renderTree();
}

function renderTree() {
    treeHost.replaceChildren();
    if (state.nodes.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'hmm-placeholder';
        empty.textContent = config.labels.empty;
        treeHost.appendChild(empty);
        return;
    }
    treeHost.appendChild(renderList(state.nodes, 0));
}

function renderList(nodes, level) {
    const ul = document.createElement('ul');
    ul.className = 'hmm-list';
    ul.setAttribute('role', 'group');
    for (const node of nodes) ul.appendChild(renderNode(node, level));
    return ul;
}

function renderNode(node, level) {
    const li = document.createElement('li');
    li.className = 'hmm-node';
    li.dataset.id = String(node.id);
    li.dataset.level = String(level);
    li.setAttribute('role', 'treeitem');
    const row = document.createElement('div');
    row.className = 'hmm-row' + (node.id === state.selectedId ? ' is-selected' : '') + (node.active ? '' : ' is-disabled') + (node.hidden_in_store ? ' is-hidden-here' : '');
    row.draggable = true;
    row.dataset.id = String(node.id);
    row.tabIndex = 0;

    const caret = document.createElement('button');
    caret.type = 'button';
    caret.className = 'hmm-caret' + (node.children.length ? '' : ' is-leaf') + (state.collapsed.has(node.id) ? ' is-collapsed' : '');
    caret.innerHTML = ICON_CARET;
    caret.setAttribute('aria-label', node.children.length ? (state.collapsed.has(node.id) ? 'Expand' : 'Collapse') : '');
    caret.addEventListener('click', (e) => { e.stopPropagation(); toggleCollapsed(node.id); });
    row.appendChild(caret);

    const handle = document.createElement('span');
    handle.className = 'hmm-handle';
    handle.innerHTML = ICON_HANDLE;
    row.appendChild(handle);

    const type = document.createElement('span');
    type.className = 'hmm-type';
    type.textContent = node.type_label;
    row.appendChild(type);

    const title = document.createElement('span');
    title.className = 'hmm-title';
    title.textContent = node.title;
    row.appendChild(title);

    if (node.badge) {
        const badge = document.createElement('span');
        badge.className = `hmm-badge hmm-badge-${node.badge.color}`;
        badge.textContent = node.badge.text;
        row.appendChild(badge);
    }
    if (node.width >= 2 && level === 0) {
        const mega = document.createElement('span');
        mega.className = 'hmm-tag';
        mega.textContent = `${node.width}/12`;
        row.appendChild(mega);
    }
    if (node.store_only) {
        const tag = document.createElement('span');
        tag.className = 'hmm-tag hmm-tag-store';
        tag.textContent = config.labels.storeOnly;
        row.appendChild(tag);
    }
    if (node.overrides.length) {
        const tag = document.createElement('span');
        tag.className = 'hmm-tag hmm-tag-override';
        tag.title = node.overrides.join(', ');
        tag.textContent = config.labels.overridden;
        row.appendChild(tag);
    }
    if (!node.active) {
        const tag = document.createElement('span');
        tag.className = 'hmm-tag hmm-tag-disabled';
        tag.textContent = config.labels.disabled;
        row.appendChild(tag);
    } else if (node.hidden_in_store) {
        const tag = document.createElement('span');
        tag.className = 'hmm-tag hmm-tag-disabled';
        tag.textContent = config.labels.hidden;
        row.appendChild(tag);
    }

    row.addEventListener('click', () => selectNode(node.id));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectNode(node.id); } });
    row.addEventListener('dragstart', onDragStart);
    row.addEventListener('dragover', onDragOver);
    row.addEventListener('dragleave', onDragLeave);
    row.addEventListener('drop', onDrop);
    row.addEventListener('dragend', clearDropMarks);
    li.appendChild(row);
    if (node.children.length) {
        const list = renderList(node.children, level + 1);
        if (state.collapsed.has(node.id)) list.hidden = true;
        li.appendChild(list);
    }
    return li;
}

function toggleCollapsed(id) {
    if (state.collapsed.has(id)) state.collapsed.delete(id); else state.collapsed.add(id);
    renderTree();
}

function selectNode(id) {
    state.selectedId = id;
    treeHost.querySelectorAll('.hmm-row').forEach((r) => r.classList.toggle('is-selected', Number(r.dataset.id) === id));
    loadForm({ item_id: id });
}

// ---- drag and drop ------------------------------------------------------

function isDescendant(id, ancestorId) {
    let node = state.byId.get(id);
    while (node && node.parent_id) {
        if (node.parent_id === ancestorId) return true;
        node = state.byId.get(node.parent_id);
    }
    return false;
}

function depthOf(node) {
    return node.children.length ? 1 + Math.max(...node.children.map(depthOf)) : 0;
}

function onDragStart(e) {
    state.dragId = Number(e.currentTarget.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(state.dragId));
    e.currentTarget.classList.add('is-dragging');
}

function zoneOf(e, row) {
    const rect = row.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height;
    if (y < 0.3) return 'before';
    if (y > 0.7) return 'after';
    return 'inside';
}

function clearDropMarks() {
    treeHost.querySelectorAll('.hmm-row').forEach((r) => r.classList.remove('drop-before', 'drop-after', 'drop-inside', 'is-dragging'));
}

function onDragOver(e) {
    const row = e.currentTarget;
    const targetId = Number(row.dataset.id);
    if (!state.dragId || targetId === state.dragId || isDescendant(targetId, state.dragId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    row.classList.remove('drop-before', 'drop-after', 'drop-inside');
    row.classList.add('drop-' + zoneOf(e, row));
}

function onDragLeave(e) {
    e.currentTarget.classList.remove('drop-before', 'drop-after', 'drop-inside');
}

async function onDrop(e) {
    e.preventDefault();
    const row = e.currentTarget;
    const zone = zoneOf(e, row);
    clearDropMarks();
    const dragged = state.byId.get(state.dragId);
    const target = state.byId.get(Number(row.dataset.id));
    state.dragId = 0;
    if (!dragged || !target || dragged.id === target.id || isDescendant(target.id, dragged.id)) return;

    const parentId = zone === 'inside' ? target.id : target.parent_id;
    if (parentId !== dragged.parent_id && !structureEditable) {
        showMessage(config.labels.storeStructure, 'error');
        return;
    }
    const parentLevel = parentId ? Number(treeHost.querySelector(`.hmm-node[data-id="${parentId}"]`)?.dataset.level ?? 0) + 1 : 0;
    if (parentLevel + depthOf(dragged) > config.maxLevel) {
        showMessage(config.labels.tooDeep, 'error');
        return;
    }
    const siblings = (parentId ? state.byId.get(parentId).children : state.nodes).map((n) => n.id).filter((id) => id !== dragged.id);
    if (zone === 'inside') siblings.push(dragged.id);
    else {
        const at = siblings.indexOf(target.id);
        siblings.splice(zone === 'before' ? at : at + 1, 0, dragged.id);
    }
    try {
        const json = await request(config.urls.move, { item_id: dragged.id, parent_id: parentId, order: siblings });
        if (json.tree) { state.collapsed.delete(parentId); setTree(json.tree); }
        showMessage(json.message, json.ok ? 'success' : 'error');
    } catch (err) {
        showMessage(err.message, 'error');
    }
}

// ---- inspector form ----------------------------------------------------

async function loadForm(params) {
    const url = new URL(config.urls.form, window.location.href);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    inspector.classList.add('is-loading');
    try {
        const response = await fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        if (!response.ok) throw new Error(config.labels.network);
        inspector.innerHTML = await response.text();
        wireForm();
    } catch (err) {
        showMessage(err.message, 'error');
    } finally {
        inspector.classList.remove('is-loading');
    }
}

function wireForm() {
    const form = inspector.querySelector('[data-hmm-form]');
    if (!form) return;
    formTitle.textContent = form.dataset.hmmTitle || config.labels.newItem;
    const typeSelect = form.querySelector('[data-hmm-type]');
    const applyType = () => {
        const type = typeSelect.value;
        form.querySelectorAll('[data-hmm-target]').forEach((field) => { field.hidden = field.dataset.hmmTarget !== type; });
    };
    typeSelect.addEventListener('change', applyType);
    applyType();
    form.querySelectorAll('[data-hmm-use-default]').forEach((box) => {
        const field = box.dataset.hmmUseDefault;
        const inputs = form.querySelectorAll(`[name="${field}"], [name^="target_"]`);
        const apply = () => {
            if (field === 'item_target_value') form.querySelectorAll('[name^="target_"]').forEach((i) => { i.disabled = box.checked; });
            else inputs.forEach((i) => { if (i.name === field) i.disabled = box.checked; });
        };
        box.addEventListener('change', apply);
    });
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {};
        // Disabled controls are not submitted: a "Use Default Value" field stays unset server side.
        for (const [key, value] of new FormData(form).entries()) {
            if (key.endsWith('[]')) (payload[key.slice(0, -2)] ||= []).push(value);
            else payload[key] = value;
        }
        try {
            const json = await request(config.urls.save, payload);
            showMessage(json.message, json.ok ? 'success' : 'error');
            if (json.ok) {
                if (json.tree) setTree(json.tree);
                if (json.item_id) { state.selectedId = json.item_id; renderTree(); loadForm({ item_id: json.item_id }); }
            }
        } catch (err) {
            showMessage(err.message, 'error');
        }
    });
    form.querySelector('[data-hmm-action="delete"]')?.addEventListener('click', async () => {
        if (!window.confirm(config.labels.confirmDelete)) return;
        try {
            const json = await request(config.urls.delete, { item_id: form.dataset.hmmItemId });
            showMessage(json.message, json.ok ? 'success' : 'error');
            if (json.ok) {
                state.selectedId = 0;
                if (json.tree) setTree(json.tree);
                inspector.innerHTML = '';
                formTitle.textContent = '';
            }
        } catch (err) {
            showMessage(err.message, 'error');
        }
    });
}

// ---- toolbar -----------------------------------------------------------

root.querySelector('[data-hmm-action="add-root"]').addEventListener('click', () => { state.selectedId = 0; renderTree(); loadForm({ item_id: 0, parent_id: 0 }); });
root.querySelector('[data-hmm-action="add-sub"]').addEventListener('click', () => {
    if (!state.selectedId) { showMessage(config.labels.selectParent, 'error'); return; }
    const level = Number(treeHost.querySelector(`.hmm-node[data-id="${state.selectedId}"]`)?.dataset.level ?? 0);
    if (level + 1 > config.maxLevel) { showMessage(config.labels.tooDeep, 'error'); return; }
    loadForm({ item_id: 0, parent_id: state.selectedId });
});
root.querySelector('[data-hmm-action="expand"]').addEventListener('click', () => { state.collapsed.clear(); renderTree(); });
root.querySelector('[data-hmm-action="collapse"]').addEventListener('click', () => { state.byId.forEach((n) => { if (n.children.length) state.collapsed.add(n.id); }); renderTree(); });
root.querySelector('[data-hmm-action="import"]').addEventListener('click', async () => {
    if (!window.confirm(config.labels.confirmImport)) return;
    try {
        const json = await request(config.urls.import, {});
        showMessage(json.message, json.ok ? 'success' : 'error');
        if (json.tree) setTree(json.tree);
    } catch (err) {
        showMessage(err.message, 'error');
    }
});

// ---- boot --------------------------------------------------------------

fetch(config.urls.tree, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
    .then((r) => r.json())
    .then((json) => setTree(json.tree))
    .catch(() => showMessage(config.labels.network, 'error'));
