import type { ApplicantCase } from "@/lib/case/types";
import { adaptSsa16 } from "@/lib/forms/adapters/ssa16";
import { adaptSsa3368 } from "@/lib/forms/adapters/ssa3368";
import { adaptSsa3369 } from "@/lib/forms/adapters/ssa3369";
import { adaptSsa827 } from "@/lib/forms/adapters/ssa827";

export function buildFormPayloads(applicantCase: ApplicantCase) {
  const forms = [
    adaptSsa16(applicantCase),
    adaptSsa3368(applicantCase),
    adaptSsa3369(applicantCase),
    adaptSsa827(applicantCase),
  ];
  if (applicantCase.authorization.additionalBlankOriginalRequested) {
    const additionalOriginal = adaptSsa827(applicantCase);
    forms.push({
      ...additionalOriginal,
      label: "SSA-827 (additional blank original)",
      payload: {
        ...additionalOriginal.payload,
        data: {
          nameFirstMiddleLastSuffix: { firstName: "", lastName: "" },
        },
      },
    });
  }
  return forms;
}

export { adaptSsa16, adaptSsa3368, adaptSsa3369, adaptSsa827 };
