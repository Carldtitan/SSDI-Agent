import type { ApplicantCase, Job } from "@/lib/case/types";
import { createAdapterResult } from "@/lib/forms/adapters/shared";
import type { AnvilFieldValue } from "@/lib/forms/types";
import { digitsOnly, splitFullName } from "@/lib/forms/value";

const detailAliases = [
  {
    title: "jobTitleNo1",
    pay: "rateOfPay1",
    payPeriod: "rateOfPayPeriod1",
    payPeriodValue: "Per Hour",
    hours: "hoursPerDay1",
    days: "daysPerWeek1",
    duties: "jobNo1TasksDescription",
    reports: "reportsWrittenOrCompletedDescription1",
    supervision: "supervisoryDutiesDescription1",
    machines: "machinesToolsAndEquipmentUsedDescription1",
    interaction: "interactionDescription1",
    interactionGroup: "didThisJobRequireInteraction",
    interactionValue: "Interact with Others - Yes",
    standing: "standingAndWalkingCombinedHoursMinutes2",
    sitting: "sittingHoursMinutes2",
    stooping: "stoopingHoursMinutes2",
    lifting: "liftingAndCarryingDescription2",
    effect: "medicalConditionsEffectOnJobAbility2",
  },
  {
    title: "jobTitleNo2",
    pay: "rateOfPay2",
    payPeriod: "rateOfPayPerPeriod",
    payPeriodValue: "Per Hour",
    hours: "hoursPerDay2",
    days: "daysPerWeek2",
    duties: "typicalWorkdayTasksDescription",
    reports: "reportsWrittenOrCompletedDescription2",
    supervision: "supervisoryDutiesDescription2",
    machines: "machinesToolsAndEquipmentUsedDescription2",
    interaction: "interactionDescription2",
    interactionGroup: "didJobRequireInteractionWithOthers1",
    interactionValue: "Interacted with Others - Yes",
    standing: "standingAndWalkingCombinedHoursMinutes3",
    sitting: "sittingHoursMinutes3",
    stooping: "stoopingHoursMinutes3",
    lifting: "liftingAndCarryingExplanation",
    effect: "medicalConditionsEffectOnJobAbility3",
  },
  {
    title: "jobTitleNo3",
    pay: "rateOfPayJob3",
    payPeriod: "payPeriodJob3",
    payPeriodValue: "Per Hour (Job 3)",
    hours: "hoursPerDayJob3",
    days: "daysPerWeekJob3",
    duties: "typicalWorkdayTasksDescriptionJob3",
    reports: "reportsWrittenOrCompletedDescriptionJob3",
    supervision: "supervisoryDutiesDescriptionJob3",
    machines: "machinesToolsAndEquipmentUsedJob3",
    interaction: "interactionDescriptionJob3",
    interactionGroup: "interactWithOthersJob3",
    interactionValue: "Interact with Others - Yes (Job 3)",
    standing: "standingAndWalkingCombinedHoursMinutes4",
    sitting: "sittingHoursMinutes4",
    stooping: "stoopingHoursMinutes4",
    lifting: "liftingAndCarryingDescription3",
    effect: "medicalConditionsEffectOnJobAbility4",
  },
  {
    title: "jobTitleNo4",
    pay: "rateOfPay3",
    payPeriod: "rateOfPayPeriod2",
    payPeriodValue: "Per Hour",
    hours: "hoursPerDay3",
    days: "daysPerWeek3",
    duties: "jobNo4TypicalWorkdayTasksDescription",
    reports: "jobNo4ReportsWrittenOrCompletedDescription",
    supervision: "jobNo4SupervisoryDutiesDescription",
    machines: "jobNo4MachinesToolsAndEquipmentUsedDescription",
    interaction: "jobNo4InteractionWithCoworkersPublicDescription",
    interactionGroup: "didJobRequireInteractionWithCoworkersPublic",
    interactionValue: "Interact with Coworkers/Public - Yes",
    standing: "standingAndWalkingCombinedHoursMinutes",
    sitting: "sittingHoursMinutes",
    stooping: "stoopingHoursMinutes",
    lifting: "liftingAndCarryingDescription",
    effect: "medicalConditionsEffectOnJobAbility",
  },
  {
    title: "jobTitleNo5",
    pay: "rateOfPay",
    payPeriod: "rateOfPayPeriod",
    payPeriodValue: "Per Hour",
    hours: "hoursPerDay",
    days: "daysPerWeek",
    duties: "jobNo5TypicalWorkdayTasksDescription",
    reports: "reportsWrittenOrCompletedDescription",
    supervision: "supervisoryDutiesDescription",
    machines: "machinesToolsAndEquipmentUsedDescription",
    interaction: "interactionDescription",
    interactionGroup: "didJobRequireInteractionWithOthers",
    interactionValue: "Interacted with Coworkers/Public - Yes",
    standing: "standingAndWalkingCombinedHoursMinutes1",
    sitting: "sittingHoursMinutes1",
    stooping: "stoopingHoursMinutes1",
    lifting: "liftingAndCarryingDescription1",
    effect: "medicalConditionsEffectOnJobAbility1",
  },
] as const;

export function adaptSsa3369(applicantCase: ApplicantCase) {
  const applicant = applicantCase.applicant;
  const data: Record<string, AnvilFieldValue | null> = {
    applicantNameFirstMiddleInitialLastSuffix: splitFullName(
      applicant.legalName.value,
    ),
    socialSecurityNumber: digitsOnly(applicant.ssn.value),
    primaryDaytimePhoneNumber: applicant.phone.value,
    dateReportCompleted: new Date().toISOString().slice(0, 10),
    whoIsCompletingThisReport: "The person named above",
    daytimePhoneNumber: applicant.phone.value,
  };

  applicantCase.jobs.slice(0, 10).forEach((job, index) => {
    const number = index + 1;
    data[`jobTitle${number}`] = job.title.value;
    data[`typeOfBusiness${number}`] = job.employer.value;
    data[`dateFromJob${number}`] = job.startDate.value;
    data[`dateToJob${number}`] = job.endDate.value;
  });

  applicantCase.jobs.slice(0, 5).forEach((job, index) => {
    applyJobDetails(data, job, detailAliases[index], applicantCase);
  });

  return createAdapterResult("ssa3369", "SSA-3369-BK", data);
}

function applyJobDetails(
  data: Record<string, AnvilFieldValue | null>,
  job: Job,
  aliases: (typeof detailAliases)[number],
  applicantCase: ApplicantCase,
) {
  data[aliases.title] = job.title.value;
  data[aliases.pay] = job.pay.value;
  data[aliases.payPeriod] = job.pay.value ? aliases.payPeriodValue : null;
  data[aliases.hours] = job.hoursPerDay.value;
  data[aliases.days] = job.daysPerWeek.value;
  data[aliases.duties] = job.duties.value?.join("; ") ?? null;
  data[aliases.reports] = job.writingAndReports.value;
  data[aliases.supervision] = job.supervision.value;
  data[aliases.machines] = job.toolsAndMachines.value?.join(", ") ?? null;
  data[aliases.interactionGroup] = aliases.interactionValue;
  data[aliases.interaction] = "Worked with staff and customers.";
  const demands = job.physicalDemands.value;
  if (demands) {
    data[aliases.standing] = `${
      (demands.standingHours ?? 0) + (demands.walkingHours ?? 0)
    } hours`;
    data[aliases.sitting] =
      demands.sittingHours === null ? null : `${demands.sittingHours} hours`;
    data[aliases.stooping] = demands.stooping;
    data[aliases.lifting] = demands.lifting;
  }
  data[aliases.effect] =
    applicantCase.conditions
      .flatMap((condition) => condition.workEffects.value ?? [])
      .join("; ") || job.reasonEnded.value;
}
