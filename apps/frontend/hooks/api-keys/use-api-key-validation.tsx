import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiKeyProvider } from "@repo/types";
import { ValidationResults } from "@/lib/types/validation";

export function useValidateApiKeys() {
  return useMutation({
    mutationFn: async (provider?: ApiKeyProvider): Promise<ValidationResults> => {
      const response = await fetch("/api/validate-keys", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: provider ? JSON.stringify({ provider }) : undefined,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    },
  });
}

export function useApiKeyValidation() {
  return useQuery({
    queryKey: ["api-key-validation"],
    queryFn: async (): Promise<ValidationResults> => {
      const response = await fetch("/api/validate-keys", {
        method: "POST",
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    enabled: false, // Only run when explicitly requested
  });
}