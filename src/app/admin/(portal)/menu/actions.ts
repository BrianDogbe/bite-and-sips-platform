'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/server/auth/current';
import { runAction, str, bool, int } from '@/server/action';
import { saveCategory, saveItem, setItemAvailability, archiveItem, deleteCategory } from '@/server/menu-admin';
import type { ActionResult } from '@/lib/action-result';

export async function categoryAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const id = int(fd, 'id');
    await saveCategory(await getCurrentUser(), { id: id ?? undefined, name: str(fd, 'name'), description: str(fd, 'description') || null, sortOrder: int(fd, 'sortOrder') ?? 0, isActive: bool(fd, 'isActive') });
    revalidatePath('/admin/menu');
  }, 'Category saved.');
}

export async function deleteCategoryAction(id: number): Promise<ActionResult> {
  return runAction(async () => {
    await deleteCategory(await getCurrentUser(), id);
    revalidatePath('/admin/menu');
  }, 'Category deleted.');
}

/** Item editor submits JSON (variants and option groups are nested). */
export async function saveItemAction(payload: unknown): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const id = await saveItem(await getCurrentUser(), payload);
    revalidatePath('/admin/menu');
    revalidatePath('/menu');
    return { id };
  }, 'Saved. Changes are live on the menu.');
}

export async function availabilityAction(id: number, available: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await setItemAvailability(await getCurrentUser(), id, available, available ? null : 'Sold out');
    revalidatePath('/admin/menu');
  }, available ? 'Marked available.' : 'Marked sold out.');
}

export async function archiveAction(id: number, archived: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await archiveItem(await getCurrentUser(), id, archived);
    revalidatePath('/admin/menu');
  }, archived ? 'Archived — removed from the menu.' : 'Restored.');
}

export async function saveRecipeAction(menuItemId: number, lines: { stockItemId: number; quantity: number; variantId: number | null }[]): Promise<ActionResult> {
  const { setRecipe } = await import('@/server/inventory');
  return runAction(async () => {
    await setRecipe(await getCurrentUser(), menuItemId, lines);
    revalidatePath(`/admin/menu/${menuItemId}`);
  }, 'Recipe saved.');
}
