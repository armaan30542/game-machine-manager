import { useQuery } from "@tanstack/react-query";
import { getMachineTypes } from "@/actions/machine-type-actions";

export function useMachineTypes() {
  return useQuery({
    queryKey: ["machine-types"],
    queryFn: () => getMachineTypes(),
  });
}
