import type { ApplicantCase } from "@/lib/case/types";
import { createAdapterResult } from "@/lib/forms/adapters/shared";
import {
  digitsOnly,
  splitFullName,
  toAnvilAddress,
} from "@/lib/forms/value";

export function adaptSsa827(applicantCase: ApplicantCase) {
  const applicant = applicantCase.applicant;
  return createAdapterResult(
    "ssa827",
    "SSA-827",
    {
      nameFirstMiddleLastSuffix: splitFullName(applicant.legalName.value),
      ssn: digitsOnly(applicant.ssn.value),
      birthday: applicant.dateOfBirth.value,
      signerStreetAddress: toAnvilAddress(applicant.address.value),
      phoneNumberWithAreaCode: applicant.phone.value,
    },
  );
}
