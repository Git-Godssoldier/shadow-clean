import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getModelSelectorCookie,
  saveModelSelectorCookie,
} from "@/lib/actions/model-selector-cookie";
import { ModelType } from "@repo/types";

export function useSelectedModel() {
  return useQuery({
    queryKey: ["selected-model"],
    queryFn: getModelSelectorCookie,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useSetSelectedModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (model: ModelType | null) => saveModelSelectorCookie(model),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["selected-model"] });
    },
  });
}
