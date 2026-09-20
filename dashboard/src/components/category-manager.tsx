"use client";

import { DragEvent, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { api } from "@/lib/api";
import { Category } from "@/components/shop-admin-types";

type DropIntent = { targetId: string; mode: "before" | "inside" | "after" };
type Draft = { name: string; slug: string; parentId: string };

function flattenCategories(categories: Category[]) {
  const byParent = new Map<string | null, Category[]>();
  for (const category of categories) {
    const siblings = byParent.get(category.parentId) ?? [];
    siblings.push(category);
    byParent.set(category.parentId, siblings);
  }
  for (const siblings of byParent.values()) siblings.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const result: { category: Category; depth: number }[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const category of byParent.get(parentId) ?? []) {
      result.push({ category, depth });
      visit(category.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

function descendantIds(categories: Category[], rootId: string) {
  const ids = new Set<string>();
  const visit = (parentId: string) => {
    for (const category of categories.filter((item) => item.parentId === parentId)) {
      ids.add(category.id);
      visit(category.id);
    }
  };
  visit(rootId);
  return ids;
}

export function CategoryManager({
  categories,
  onChanged,
  onMessage,
  onError,
}: {
  categories: Category[];
  onChanged: () => Promise<unknown>;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { register, handleSubmit, reset: resetFormValues, formState: { isSubmitting } } = useForm<Draft>({ defaultValues: { name: "", slug: "", parentId: "" } });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null);
  const [saving, setSaving] = useState(false);
  const tree = useMemo(() => flattenCategories(categories), [categories]);
  const unavailableParents = useMemo(
    () => editingId ? new Set([editingId, ...descendantIds(categories, editingId)]) : new Set<string>(),
    [categories, editingId],
  );

  function resetForm() {
    setEditingId(null);
    resetFormValues({ name: "", slug: "", parentId: "" });
  }

  function startEditing(category: Category) {
    setEditingId(category.id);
    resetFormValues({ name: category.name, slug: category.slug, parentId: category.parentId ?? "" });
  }

  async function save(values: Draft) {
    setSaving(true);
    onError("");
    try {
      await api(editingId ? `/shop/admin/categories/${editingId}` : "/shop/admin/categories", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({ ...values, parentId: values.parentId || null }),
      });
      onMessage(editingId ? "Category updated." : "Category added.");
      resetForm();
      await onChanged();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Could not save category.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(category: Category) {
    if (!window.confirm(`Remove “${category.name}”? This cannot be undone.`)) return;
    onError("");
    try {
      await api(`/shop/admin/categories/${category.id}`, { method: "DELETE" });
      if (editingId === category.id) resetForm();
      onMessage("Category removed.");
      await onChanged();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Could not remove category.");
    }
  }

  function updateDropIntent(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - bounds.top) / bounds.height;
    const mode = ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
    setDropIntent({ targetId, mode });
    event.dataTransfer.dropEffect = "move";
  }

  async function moveCategory(categoryId: string, parentId: string | null, position: number, successMessage: string) {
    onError("");
    try {
      await api(`/shop/admin/categories/${categoryId}/position`, {
        method: "PATCH",
        body: JSON.stringify({ parentId, position }),
      });
      onMessage(successMessage);
      await onChanged();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Could not move category.");
    }
  }

  function reorderWithKeyboard(category: Category, direction: -1 | 1) {
    const siblings = categories
      .filter((item) => item.parentId === category.parentId)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    const currentIndex = siblings.findIndex((item) => item.id === category.id);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= siblings.length) return;
    void moveCategory(category.id, category.parentId, nextIndex, "Category reordered.");
  }

  async function drop(event: DragEvent<HTMLElement>, target: Category) {
    event.preventDefault();
    const sourceId = draggingId;
    const intent = dropIntent;
    setDraggingId(null);
    setDropIntent(null);
    if (!sourceId || sourceId === target.id || !intent) return;
    let parentId: string | null;
    let position: number;
    if (intent.mode === "inside") {
      parentId = target.id;
      position = categories.filter((item) => item.parentId === target.id && item.id !== sourceId).length;
    } else {
      parentId = target.parentId;
      const siblings = categories
        .filter((item) => item.parentId === parentId && item.id !== sourceId)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
      const targetIndex = siblings.findIndex((item) => item.id === target.id);
      position = targetIndex + (intent.mode === "after" ? 1 : 0);
    }
    await moveCategory(sourceId, parentId, position, intent.mode === "inside" ? "Category nested." : "Category reordered.");
  }

  return (
    <div className="category-manager-layout">
      <section className="content-card category-tree-card">
        <div className="section-heading">
          <div><p className="eyebrow">Structure</p><h2>Category tree</h2></div>
          <span className="manager-note">Drag to reorder or nest</span>
        </div>
        <div className="category-tree" role="tree" aria-label="Shop categories">
          {tree.map(({ category, depth }) => (
            <article
              key={category.id}
              className={`category-tree-row${draggingId === category.id ? " dragging" : ""}`}
              data-drop-mode={dropIntent?.targetId === category.id ? dropIntent.mode : undefined}
              style={{ "--category-depth": depth } as React.CSSProperties}
              draggable
              onDragStart={(event) => {
                setDraggingId(category.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", category.id);
              }}
              onDragEnd={() => { setDraggingId(null); setDropIntent(null); }}
              onDragOver={(event) => updateDropIntent(event, category.id)}
              onDrop={(event) => void drop(event, category)}
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={editingId === category.id}
            >
              <span className="category-drag-handle" aria-hidden>⋮⋮</span>
              <div>
                <strong>{category.name}</strong>
                <span>/{category.slug} · {category._count.products} products · {category._count.children} children</span>
              </div>
              <div className="category-row-actions">
                <button className="category-order-button" type="button" aria-label={`Move ${category.name} up`} onClick={() => reorderWithKeyboard(category, -1)}>↑</button>
                <button className="category-order-button" type="button" aria-label={`Move ${category.name} down`} onClick={() => reorderWithKeyboard(category, 1)}>↓</button>
                <button className="text-button" type="button" onClick={() => startEditing(category)}>Edit</button>
                <button className="danger-text-button" type="button" onClick={() => void remove(category)}>Remove</button>
              </div>
            </article>
          ))}
          {!tree.length && <p className="manager-note">Create the first category to organize your catalogue.</p>}
        </div>
        <p className="category-drag-help">Drop near the top or bottom edge to reorder. Drop in the center to make a category a child.</p>
      </section>
      <section className="content-card category-editor-card">
        <div className="section-heading">
          <div><p className="eyebrow">Details</p><h2>{editingId ? "Edit category" : "New category"}</h2></div>
          {editingId && <button className="text-button" type="button" onClick={resetForm}>Cancel</button>}
        </div>
        <form className="shop-form" onSubmit={handleSubmit(save)}>
          <label>Category name<input maxLength={80} {...register("name", { required: true })} /></label>
          <label>URL slug<input maxLength={80} {...register("slug", { required: true })} /></label>
          <label>
            Parent category
            <select {...register("parentId")}>
              <option value="">No parent — top level</option>
              {tree.filter(({ category }) => !unavailableParents.has(category.id)).map(({ category, depth }) => (
                <option key={category.id} value={category.id}>{"— ".repeat(depth)}{category.name}</option>
              ))}
            </select>
          </label>
          <button className="admin-action" type="submit" disabled={saving || isSubmitting}>{saving || isSubmitting ? "Saving…" : editingId ? "Save changes" : "Add category"}</button>
        </form>
      </section>
    </div>
  );
}
