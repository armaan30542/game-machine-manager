import { useQuery } from "@tanstack/react-query";
import { getCabinetTypes } from "@/actions/cabinet-type-actions";

export function useCabinetTypes() {
  return useQuery({
    queryKey: ["cabinet-types"],
    queryFn: () => getCabinetTypes(),
  });
}
