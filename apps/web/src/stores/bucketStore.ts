import { create } from 'zustand';
import type { TestBucket, ActionGroup, Step } from '@fortest/types';
import { renameStepReferences } from '@fortest/utils';

export interface ImportResult {
  warnings: string[];
  source: 'postman' | 'fortest';
}

interface BucketState {
  buckets: TestBucket[];
  activeBucketId: string | null;
  activeGroupId: string | null;
  activeStepId: string | null;
  isLoading: boolean;
  error: string | null;

  // Bucket CRUD
  loadBuckets: () => Promise<void>;
  createBucket: (name: string, baseUrl?: string) => Promise<void>;
  updateBucket: (id: string, data: Partial<TestBucket>) => Promise<void>;
  deleteBucket: (id: string) => Promise<void>;
  importBucket: (content: string, format: 'json' | 'yaml') => Promise<ImportResult>;

  // Navigation
  setActiveBucket: (id: string | null) => void;
  setActiveGroup: (id: string | null) => void;
  setActiveStep: (id: string | null) => void;

  // Computed helpers
  getActiveBucket: () => TestBucket | undefined;
  getActiveGroup: () => ActionGroup | undefined;
  getActiveStep: () => Step | undefined;

  // Nested mutations
  addActionGroup: (bucketId: string, name: string, description?: string) => Promise<void>;
  updateActionGroup: (bucketId: string, groupId: string, data: Partial<ActionGroup>) => Promise<void>;
  deleteActionGroup: (bucketId: string, groupId: string) => Promise<void>;
  addStep: (bucketId: string, groupId: string, name: string) => Promise<void>;
  /** Resolves to how many {{steps.<name>.…}} references in other steps a rename updated. */
  updateStep: (bucketId: string, groupId: string, stepId: string, data: Partial<Step>) => Promise<number>;
  deleteStep: (bucketId: string, groupId: string, stepId: string) => Promise<void>;
  reorderSteps: (bucketId: string, groupId: string, stepIds: string[]) => Promise<void>;
  duplicateStep: (bucketId: string, groupId: string, stepId: string) => Promise<void>;
}

export const useBucketStore = create<BucketState>((set, get) => ({
  buckets: [],
  activeBucketId: null,
  activeGroupId: null,
  activeStepId: null,
  isLoading: false,
  error: null,

  loadBuckets: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/buckets');
      if (!res.ok) throw new Error('Failed to load buckets');
      const buckets = await res.json();
      set({ buckets, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to load buckets', isLoading: false });
    }
  },

  createBucket: async (name, baseUrl) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/buckets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, baseUrl }),
      });
      if (!res.ok) throw new Error('Failed to create bucket');
      await get().loadBuckets();
    } catch (err: any) {
      const errMsg = err.message || 'Failed to create bucket';
      set({ error: errMsg, isLoading: false });
      throw new Error(errMsg);
    }
  },

  updateBucket: async (id, data) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/buckets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || 'Failed to update bucket');
      await get().loadBuckets();
    } catch (err: any) {
      const errMsg = err.message || 'Failed to update bucket';
      set({ error: errMsg });
      throw new Error(errMsg);
    }
  },

  deleteBucket: async (id) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/buckets/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete bucket');
      
      const { activeBucketId } = get();
      if (activeBucketId === id) {
        set({ activeBucketId: null, activeGroupId: null, activeStepId: null });
      }
      
      await get().loadBuckets();
    } catch (err: any) {
      const errMsg = err.message || 'Failed to delete bucket';
      set({ error: errMsg });
      throw new Error(errMsg);
    }
  },

  importBucket: async (content, format) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/buckets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, format }),
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to import bucket');
      }

      const data = await res.json();
      await get().loadBuckets();

      // Return import metadata if present (Postman imports include warnings)
      if (data._importMeta) {
        return {
          source: data._importMeta.source || 'postman',
          warnings: data._importMeta.warnings || [],
        };
      }

      return { source: 'fortest', warnings: [] };
    } catch (err: any) {
      const errMsg = err.message || 'Failed to import bucket';
      set({ error: errMsg, isLoading: false });
      throw new Error(errMsg);
    }
  },


  setActiveBucket: (id) => set({ activeBucketId: id, activeGroupId: null, activeStepId: null }),
  setActiveGroup: (id) => set({ activeGroupId: id, activeStepId: null }),
  setActiveStep: (id) => set({ activeStepId: id }),

  getActiveBucket: () => {
    const { buckets, activeBucketId } = get();
    return buckets.find((b) => b.id === activeBucketId);
  },

  getActiveGroup: () => {
    const bucket = get().getActiveBucket();
    if (!bucket) return undefined;
    return bucket.actionGroups.find((g) => g.id === get().activeGroupId);
  },

  getActiveStep: () => {
    const group = get().getActiveGroup();
    if (!group) return undefined;
    return group.steps.find((s) => s.id === get().activeStepId);
  },

  addActionGroup: async (bucketId, name, description = '') => {
    const bucket = get().buckets.find((b) => b.id === bucketId);
    if (!bucket) return;

    const newGroup: ActionGroup = {
      id: crypto.randomUUID(),
      name,
      description,
      order: bucket.actionGroups.length,
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedGroups = [...bucket.actionGroups, newGroup];
    await get().updateBucket(bucketId, { actionGroups: updatedGroups });
  },

  updateActionGroup: async (bucketId, groupId, data) => {
    const bucket = get().buckets.find((b) => b.id === bucketId);
    if (!bucket) return;

    const updatedGroups = bucket.actionGroups.map((g) => {
      if (g.id === groupId) {
        return {
          ...g,
          ...data,
          updatedAt: new Date().toISOString(),
        };
      }
      return g;
    });

    await get().updateBucket(bucketId, { actionGroups: updatedGroups });
  },

  deleteActionGroup: async (bucketId, groupId) => {
    const bucket = get().buckets.find((b) => b.id === bucketId);
    if (!bucket) return;

    const updatedGroups = bucket.actionGroups
      .filter((g) => g.id !== groupId)
      .map((g, index) => ({ ...g, order: index }));

    const { activeGroupId } = get();
    if (activeGroupId === groupId) {
      set({ activeGroupId: null, activeStepId: null });
    }

    await get().updateBucket(bucketId, { actionGroups: updatedGroups });
  },

  addStep: async (bucketId, groupId, name) => {
    const bucket = get().buckets.find((b) => b.id === bucketId);
    if (!bucket) return;

    const group = bucket.actionGroups.find((g) => g.id === groupId);
    if (!group) return;

    const targetName = name.trim().toLowerCase();
    const duplicateExists = group.steps.some(
      (s) => s.name.trim().toLowerCase() === targetName
    );
    if (duplicateExists) {
      throw new Error(`A step named "${name}" already exists in this action group.`);
    }

    const newStep: Step = {
      id: crypto.randomUUID(),
      name,
      order: group.steps.length,
      method: 'GET',
      path: '/',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      auth: { type: 'none' },
      extractions: [],
      assertions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedGroups = bucket.actionGroups.map((g) => {
      if (g.id === groupId) {
        return {
          ...g,
          steps: [...g.steps, newStep],
          updatedAt: new Date().toISOString(),
        };
      }
      return g;
    });

    await get().updateBucket(bucketId, { actionGroups: updatedGroups });
  },

  updateStep: async (bucketId, groupId, stepId, data) => {
    const bucket = get().buckets.find((b) => b.id === bucketId);
    if (!bucket) return 0;

    const group = bucket.actionGroups.find((g) => g.id === groupId);
    if (!group) return 0;

    // A rename carries the other steps' {{steps.<old name>.…}} references along with it.
    const oldName = group.steps.find((s) => s.id === stepId)?.name;
    const renamed = data.name !== undefined && oldName !== undefined && data.name !== oldName;
    let referencesUpdated = 0;

    if (data.name) {
      const targetName = data.name.trim().toLowerCase();
      const duplicateExists = group.steps.some(
        (s) => s.id !== stepId && s.name.trim().toLowerCase() === targetName
      );
      if (duplicateExists) {
        throw new Error(`A step named "${data.name}" already exists in this action group.`);
      }
    }

    const updatedGroups = bucket.actionGroups.map((g) => {
      if (g.id === groupId) {
        return {
          ...g,
          steps: g.steps.map((s) => {
            if (s.id === stepId) {
              return {
                ...s,
                ...data,
                updatedAt: new Date().toISOString(),
              };
            }
            if (!renamed) return s;
            const { step, count } = renameStepReferences(s, oldName, data.name!);
            referencesUpdated += count;
            return step;
          }),
          updatedAt: new Date().toISOString(),
        };
      }
      return g;
    });

    await get().updateBucket(bucketId, { actionGroups: updatedGroups });
    return referencesUpdated;
  },

  deleteStep: async (bucketId, groupId, stepId) => {
    const bucket = get().buckets.find((b) => b.id === bucketId);
    if (!bucket) return;

    const updatedGroups = bucket.actionGroups.map((g) => {
      if (g.id === groupId) {
        const filteredSteps = g.steps
          .filter((s) => s.id !== stepId)
          .map((s, index) => ({ ...s, order: index }));
        return {
          ...g,
          steps: filteredSteps,
          updatedAt: new Date().toISOString(),
        };
      }
      return g;
    });

    const { activeStepId } = get();
    if (activeStepId === stepId) {
      set({ activeStepId: null });
    }

    await get().updateBucket(bucketId, { actionGroups: updatedGroups });
  },

  reorderSteps: async (bucketId, groupId, stepIds) => {
    const bucket = get().buckets.find((b) => b.id === bucketId);
    if (!bucket) return;

    const updatedGroups = bucket.actionGroups.map((g) => {
      if (g.id === groupId) {
        const reordered = g.steps
          .map((s) => {
            const newIndex = stepIds.indexOf(s.id);
            return {
              ...s,
              order: newIndex !== -1 ? newIndex : s.order,
            };
          })
          .sort((a, b) => a.order - b.order);

        return {
          ...g,
          steps: reordered,
          updatedAt: new Date().toISOString(),
        };
      }
      return g;
    });

    await get().updateBucket(bucketId, { actionGroups: updatedGroups });
  },

  duplicateStep: async (bucketId, groupId, stepId) => {
    const bucket = get().buckets.find((b) => b.id === bucketId);
    if (!bucket) return;

    const group = bucket.actionGroups.find((g) => g.id === groupId);
    if (!group) return;

    const sourceStep = group.steps.find((s) => s.id === stepId);
    if (!sourceStep) return;

    let targetCopyName = `${sourceStep.name} (Copy)`;
    let copyCounter = 1;
    while (group.steps.some((s) => s.name.trim().toLowerCase() === targetCopyName.trim().toLowerCase())) {
      copyCounter++;
      targetCopyName = `${sourceStep.name} (Copy ${copyCounter})`;
    }

    const newStep: Step = {
      ...sourceStep,
      id: crypto.randomUUID(),
      name: targetCopyName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      headers: sourceStep.headers.map((h) => ({ ...h, id: crypto.randomUUID() })),
      params: sourceStep.params.map((p) => ({ ...p, id: crypto.randomUUID() })),
      body: {
        ...sourceStep.body,
      },
      extractions: sourceStep.extractions.map((e) => ({ ...e, id: crypto.randomUUID() })),
      assertions: sourceStep.assertions.map((a) => ({ ...a, id: crypto.randomUUID() })),
    };

    const sortedSteps = [...group.steps].sort((a, b) => a.order - b.order);
    const sourceIndex = sortedSteps.findIndex((s) => s.id === stepId);

    sortedSteps.splice(sourceIndex + 1, 0, newStep);

    const updatedSteps = sortedSteps.map((s, index) => ({
      ...s,
      order: index,
    }));

    const updatedGroups = bucket.actionGroups.map((g) => {
      if (g.id === groupId) {
        return {
          ...g,
          steps: updatedSteps,
          updatedAt: new Date().toISOString(),
        };
      }
      return g;
    });

    await get().updateBucket(bucketId, { actionGroups: updatedGroups });
  },
}));
