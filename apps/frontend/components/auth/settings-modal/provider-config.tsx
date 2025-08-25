"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { ModelType, ApiKeyProvider, API_KEY_PROVIDER_NAMES } from "@repo/types";
import { useState, useEffect } from "react";
import {
  useUserSettings,
  useUpdateUserSettings,
} from "@/hooks/use-user-settings";
import {
  getAllPossibleModelsInfo,
  getModelDefaults,
} from "@/lib/actions/api-keys";

export function ProviderConfig({ provider }: { provider: ApiKeyProvider }) {
  const { data: userSettings, isLoading: isLoadingSettings } =
    useUserSettings();
  const updateUserSettings = useUpdateUserSettings();

  const [allModels, setAllModels] = useState<
    { id: string; name: string; provider: string }[]
  >([]);
  const [defaults, setDefaults] = useState<{
    defaultModels: ModelType[];
  }>({ defaultModels: [] });

  useEffect(() => {
    const loadModelData = async () => {
      try {
        const [modelsInfo, defaultsInfo] = await Promise.all([
          getAllPossibleModelsInfo(),
          getModelDefaults(),
        ]);
        setAllModels(modelsInfo);
        setDefaults(defaultsInfo);
      } catch (error) {
        console.error("Failed to load model data:", error);
      }
    };
    loadModelData();
  }, []);

  const getSelectedModels = (): ModelType[] => {
    if (
      userSettings?.selectedModels &&
      userSettings.selectedModels.length > 0
    ) {
      return userSettings.selectedModels as ModelType[];
    }
    return defaults.defaultModels;
  };

  const handleModelToggle = (modelId: ModelType, checked: boolean) => {
    const currentSelected = getSelectedModels();
    const newSelected = checked
      ? [...currentSelected, modelId]
      : currentSelected.filter((id) => id !== modelId);

    updateUserSettings.mutate({ selectedModels: newSelected });
  };

  const selectedModels = getSelectedModels();
  const providerModels = allModels.filter((m) => m.provider === provider);

  if (!provider || providerModels.length === 0) {
    return (
      <div className="flex w-full flex-col gap-6">
        <p className="text-muted-foreground text-sm">
          No models available for this provider.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          Select which {API_KEY_PROVIDER_NAMES[provider]} models appear in your
          model selector.
        </div>

        <div className="space-y-2">
          {providerModels.map((model) => (
            <div key={model.id} className="flex items-center space-x-2">
              <Checkbox
                id={`model-${model.id}`}
                checked={selectedModels.includes(model.id as ModelType)}
                onCheckedChange={(checked) =>
                  handleModelToggle(model.id as ModelType, !!checked)
                }
                disabled={isLoadingSettings || updateUserSettings.isPending}
              />
              <label
                htmlFor={`model-${model.id}`}
                className="flex-1 cursor-pointer text-sm"
              >
                {model.name}
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
