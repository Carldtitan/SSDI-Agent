import type {
  ApplicantCase,
  SupportedLocale,
} from "@/lib/case/types";
import type { LocalizedText } from "@/lib/i18n/locales";

export type QuestionRequirement = "required" | "conditional" | "optional";

export type QuestionAnswerKind =
  | "text"
  | "ssn"
  | "date"
  | "yes_no"
  | "currency"
  | "address"
  | "condition"
  | "work_effect"
  | "providers"
  | "medications"
  | "jobs"
  | "marriages"
  | "children";

export interface QuestionDefinition {
  id: string;
  requirement: QuestionRequirement;
  answerKind: QuestionAnswerKind;
  allowUnknown: boolean;
  blocksPacket: boolean;
  canonicalTargets: string[];
  affectedForms: Array<"SSA-16" | "SSA-3368" | "SSA-3369" | "SSA-827">;
  prompt: LocalizedText;
  explanation: LocalizedText;
  isActive: (applicantCase: ApplicantCase) => boolean;
  isAnswered: (applicantCase: ApplicantCase) => boolean;
}

const always = () => true;
const confirmed = <T>(value: {
  value: T | null;
  provenance: { state: string };
}) =>
  value.value !== null &&
  value.provenance.state === "confirmed";

export const QUESTION_REGISTRY: readonly QuestionDefinition[] = [
  question({
    id: "legal-name",
    answerKind: "text",
    targets: ["applicant.legalName"],
    forms: ["SSA-16", "SSA-3368", "SSA-3369", "SSA-827"],
    prompt: [
      "What is your full legal name?",
      "¿Cuál es su nombre legal completo?",
      "您的法定全名是什么？",
    ],
    explanation: [
      "Social Security uses your legal name to match your application to the correct record.",
      "El Seguro Social usa su nombre legal para vincular la solicitud con el registro correcto.",
      "社会保障局用您的法定姓名匹配正确的记录。",
    ],
    answered: (value) => confirmed(value.applicant.legalName),
  }),
  question({
    id: "ssn",
    answerKind: "ssn",
    targets: ["applicant.ssn"],
    forms: ["SSA-16", "SSA-3368", "SSA-3369", "SSA-827"],
    prompt: [
      "What is your Social Security number? You can say each digit separately.",
      "¿Cuál es su número de Seguro Social? Puede decir cada dígito por separado.",
      "您的社会安全号码是什么？您可以逐位说出。",
    ],
    explanation: [
      "It connects the application to your earnings record. I will repeat the digits for confirmation.",
      "Conecta la solicitud con su registro de ingresos. Repetiré los dígitos para confirmarlos.",
      "它用于连接您的申请和收入记录。我会逐位复述，请您确认。",
    ],
    answered: (value) => confirmed(value.applicant.ssn),
  }),
  question({
    id: "date-of-birth",
    answerKind: "date",
    targets: ["applicant.dateOfBirth", "eligibilityInput.dateOfBirth"],
    forms: ["SSA-16", "SSA-3368", "SSA-3369", "SSA-827"],
    prompt: [
      "What is your date of birth?",
      "¿Cuál es su fecha de nacimiento?",
      "您的出生日期是什么？",
    ],
    explanation: [
      "Your birth date is used for identity and work-credit rules.",
      "Su fecha de nacimiento se usa para verificar su identidad y las reglas de créditos de trabajo.",
      "出生日期用于身份核验和工作积分规则。",
    ],
    answered: (value) => confirmed(value.applicant.dateOfBirth),
  }),
  question({
    id: "place-of-birth",
    answerKind: "text",
    targets: ["applicant.placeOfBirth"],
    forms: ["SSA-16"],
    prompt: [
      "In what city, state, and country were you born?",
      "¿En qué ciudad, estado y país nació?",
      "您出生在哪个城市、州或省以及国家？",
    ],
    explanation: [
      "Social Security asks for your place of birth to verify identity.",
      "El Seguro Social solicita su lugar de nacimiento para verificar su identidad.",
      "社会保障局要求出生地点以核验身份。",
    ],
    answered: (value) => confirmed(value.applicant.placeOfBirth),
  }),
  question({
    id: "citizenship",
    answerKind: "text",
    targets: ["applicant.citizenship", "nonCitizen"],
    forms: ["SSA-16"],
    prompt: [
      "Are you a United States citizen? If not, tell me your current immigration status.",
      "¿Es ciudadano de los Estados Unidos? Si no, indique su situación migratoria actual.",
      "您是美国公民吗？如果不是，请说明您目前的移民身份。",
    ],
    explanation: [
      "Social Security must document citizenship or eligible immigration status.",
      "El Seguro Social debe documentar la ciudadanía o una situación migratoria elegible.",
      "社会保障局需要记录公民身份或符合条件的移民身份。",
    ],
    answered: (value) =>
      confirmed(value.applicant.citizenship) &&
      confirmed(value.nonCitizen),
  }),
  question({
    id: "mailing-address",
    answerKind: "address",
    targets: ["applicant.address"],
    forms: ["SSA-16", "SSA-3368", "SSA-3369", "SSA-827"],
    prompt: [
      "What mailing address should Social Security use?",
      "¿Qué dirección postal debe usar el Seguro Social?",
      "社会保障局应使用哪个邮寄地址？",
    ],
    explanation: [
      "Social Security needs a reliable address for notices about your claim.",
      "El Seguro Social necesita una dirección confiable para enviar avisos sobre su solicitud.",
      "社会保障局需要可靠的地址向您发送申请通知。",
    ],
    answered: (value) => confirmed(value.applicant.address),
  }),
  question({
    id: "phone",
    answerKind: "text",
    targets: ["applicant.phone"],
    forms: ["SSA-16", "SSA-3368", "SSA-3369", "SSA-827"],
    prompt: [
      "What phone number is best for reaching you?",
      "¿Cuál es el mejor número de teléfono para comunicarse con usted?",
      "哪个电话号码最方便联系您？",
    ],
    explanation: [
      "A reliable phone number helps Social Security follow up without delaying the application.",
      "Un número confiable ayuda al Seguro Social a comunicarse sin retrasar la solicitud.",
      "可靠的电话号码可帮助社会保障局及时联系您，避免延误。",
    ],
    answered: (value) => confirmed(value.applicant.phone),
  }),
  question({
    id: "current-work",
    answerKind: "yes_no",
    targets: ["currentlyEarning"],
    forms: ["SSA-16"],
    prompt: [
      "Are you working for pay right now?",
      "¿Está trabajando por pago actualmente?",
      "您目前是否在从事有报酬的工作？",
    ],
    explanation: [
      "Current work can affect how Social Security evaluates the application, but it does not automatically decide the outcome.",
      "El trabajo actual puede afectar la evaluación, pero no decide automáticamente el resultado.",
      "当前工作可能影响评估，但不会自动决定结果。",
    ],
    answered: (value) => confirmed(value.currentlyEarning),
  }),
  question({
    id: "monthly-earnings",
    answerKind: "currency",
    requirement: "conditional",
    targets: ["eligibilityInput.monthlyEarningsUsd"],
    forms: ["SSA-16"],
    prompt: [
      "About how much do you earn from work in an average month before taxes?",
      "Aproximadamente, ¿cuánto gana por trabajo en un mes promedio antes de impuestos?",
      "您平均每月税前工作收入大约是多少？",
    ],
    explanation: [
      "Social Security compares countable work earnings with an annually updated guideline and considers exceptions separately.",
      "El Seguro Social compara los ingresos contables con una guía anual y considera las excepciones por separado.",
      "社会保障局会将可计入的工作收入与年度标准比较，并另行考虑例外情况。",
    ],
    active: (value) => value.currentlyEarning.value === true,
    answered: (value) =>
      Number.isFinite(value.eligibilityInput.monthlyEarningsUsd),
  }),
  question({
    id: "statutory-blindness",
    answerKind: "yes_no",
    targets: ["eligibilityInput.statutorilyBlind"],
    forms: ["SSA-16", "SSA-3368"],
    prompt: [
      "Has a medical professional told you that you meet Social Security’s definition of statutory blindness?",
      "¿Un profesional médico le ha dicho que cumple con la definición de ceguera legal del Seguro Social?",
      "医疗专业人员是否告知您符合社会保障局的法定盲人标准？",
    ],
    explanation: [
      "Social Security uses a different work-earnings guideline for statutory blindness.",
      "El Seguro Social usa una guía de ingresos diferente para la ceguera legal.",
      "社会保障局对法定盲人采用不同的工作收入标准。",
    ],
    answered: (value) =>
      value.eligibilityInput.statutorilyBlind !== null,
  }),
  question({
    id: "condition-duration",
    answerKind: "yes_no",
    targets: ["eligibilityInput.conditionExpectedToLast12Months"],
    forms: ["SSA-16", "SSA-3368"],
    prompt: [
      "Has your condition lasted, or is it expected to last, at least twelve months?",
      "¿Su condición ha durado, o se espera que dure, al menos doce meses?",
      "您的病情是否已经持续或预计会持续至少十二个月？",
    ],
    explanation: [
      "The disability program generally requires the condition to last at least twelve months or be expected to result in death.",
      "El programa generalmente exige que la condición dure al menos doce meses o que se espere que cause la muerte.",
      "残障福利通常要求病情持续至少十二个月，或预计会导致死亡。",
    ],
    answered: (value) =>
      value.eligibilityInput.conditionExpectedToLast12Months !== null,
  }),
  question({
    id: "conditions",
    answerKind: "condition",
    targets: ["conditions"],
    forms: ["SSA-16", "SSA-3368"],
    prompt: [
      "What physical or mental health conditions limit your ability to work?",
      "¿Qué condiciones físicas o de salud mental limitan su capacidad para trabajar?",
      "哪些身体或心理健康状况限制了您的工作能力？",
    ],
    explanation: [
      "The application needs the conditions you say prevent or limit work.",
      "La solicitud necesita las condiciones que, según usted, impiden o limitan su trabajo.",
      "申请需要记录您认为妨碍或限制工作的健康状况。",
    ],
    answered: (value) =>
      value.conditions.some((condition) => confirmed(condition.name)),
  }),
  question({
    id: "onset-date",
    answerKind: "date",
    targets: [
      "eligibilityInput.allegedOnsetDate",
      "conditions[].allegedOnsetDate",
    ],
    forms: ["SSA-16", "SSA-3368"],
    prompt: [
      "When did your conditions become severe enough to stop or substantially limit your work?",
      "¿Cuándo se volvieron sus condiciones lo bastante graves como para impedir o limitar considerablemente su trabajo?",
      "您的病情从什么时候开始严重到使您无法工作或明显限制工作？",
    ],
    explanation: [
      "This work-limiting date must stay consistent across the application forms.",
      "Esta fecha debe ser coherente en todos los formularios de la solicitud.",
      "这个工作受限日期必须在所有申请表中保持一致。",
    ],
    answered: (value) =>
      Boolean(value.eligibilityInput.allegedOnsetDate),
  }),
  question({
    id: "work-effects",
    answerKind: "work_effect",
    targets: ["conditions[].workEffects"],
    forms: ["SSA-3368", "SSA-3369"],
    prompt: [
      "Tell me what happens when you try to work. Include things such as sitting, standing, lifting, concentrating, remembering, or dealing with other people.",
      "Cuénteme qué ocurre cuando intenta trabajar. Incluya, por ejemplo, sentarse, estar de pie, levantar peso, concentrarse, recordar o tratar con otras personas.",
      "请说明您尝试工作时会遇到什么困难，例如坐、站、搬抬、集中注意力、记忆或与他人相处。",
    ],
    explanation: [
      "Specific functional limits help explain how the conditions affect work.",
      "Las limitaciones funcionales específicas ayudan a explicar cómo las condiciones afectan el trabajo.",
      "具体的功能限制有助于说明病情如何影响工作。",
    ],
    answered: (value) =>
      value.conditions.some(
        (condition) =>
          confirmed(condition.workEffects) &&
          Boolean(condition.workEffects.value?.length),
      ),
  }),
  question({
    id: "education",
    answerKind: "text",
    targets: ["education.highestLevel"],
    forms: ["SSA-3368"],
    prompt: [
      "What is the highest grade or level of school you completed?",
      "¿Cuál es el grado o nivel escolar más alto que completó?",
      "您完成的最高教育程度是什么？",
    ],
    explanation: [
      "Education is considered together with age, work history, and functional limits.",
      "La educación se considera junto con la edad, el historial laboral y las limitaciones funcionales.",
      "教育程度会与年龄、工作经历和功能限制一起考虑。",
    ],
    answered: (value) => confirmed(value.education.highestLevel),
  }),
  collectionQuestion(
    "marriages",
    "marriages",
    [
      "Tell me about any current or former marriages. Say “none” if you have never been married.",
      "Hábleme de sus matrimonios actuales o anteriores. Diga “ninguno” si nunca se ha casado.",
      "请说明您目前或过去的婚姻情况。如果从未结婚，请说“没有”。",
    ],
    ["SSA-16"],
  ),
  collectionQuestion(
    "children",
    "children",
    [
      "Tell me about your children, including adult children who became disabled before age twenty-two. Say “none” if this does not apply.",
      "Hábleme de sus hijos, incluidos los hijos adultos que quedaron discapacitados antes de los veintidós años. Diga “ninguno” si no corresponde.",
      "请说明您的子女情况，包括在二十二岁前残障的成年子女。如果不适用，请说“没有”。",
    ],
    ["SSA-16"],
  ),
  collectionQuestion(
    "providers",
    "providers",
    [
      "Tell me the name of one doctor, clinic, hospital, therapist, or other place that treated any of your conditions. Say “no more providers” only when the list is complete.",
      "Dígame el nombre de un médico, clínica, hospital, terapeuta u otro lugar que haya tratado alguna de sus condiciones. Diga “no hay más proveedores” solo cuando la lista esté completa.",
      "请告诉我一位治疗过您病情的医生、诊所、医院、治疗师或其他机构。只有名单完整时，请说“没有其他医疗机构”。",
    ],
    ["SSA-3368", "SSA-827"],
  ),
  collectionQuestion(
    "medications",
    "medications",
    [
      "Tell me about each medicine you take for your conditions. Say “none” if you take no medicines for them.",
      "Hábleme de cada medicamento que toma para sus condiciones. Diga “ninguno” si no toma medicamentos para ellas.",
      "请说明您为这些病情服用的每种药物。如果没有服药，请说“没有”。",
    ],
    ["SSA-3368"],
    false,
  ),
  collectionQuestion(
    "jobs",
    "jobs",
    [
      "Tell me about every job you held during the five years before you became unable to work. Say “no more jobs” when the list is complete.",
      "Hábleme de cada trabajo que tuvo durante los cinco años anteriores a cuando dejó de poder trabajar. Diga “no hay más trabajos” cuando la lista esté completa.",
      "请说明您无法工作前五年内从事过的每一份工作。名单完整时，请说“没有其他工作”。",
    ],
    ["SSA-3369"],
  ),
] as const;

export function activeQuestions(
  applicantCase: ApplicantCase,
): QuestionDefinition[] {
  return QUESTION_REGISTRY.filter((entry) => entry.isActive(applicantCase));
}

export function nextQuestion(
  applicantCase: ApplicantCase,
): QuestionDefinition | null {
  return (
    activeQuestions(applicantCase).find(
      (entry) => !entry.isAnswered(applicantCase),
    ) ?? null
  );
}

export function questionById(id: string | null): QuestionDefinition | null {
  if (!id) return null;
  return QUESTION_REGISTRY.find((entry) => entry.id === id) ?? null;
}

function question({
  id,
  answerKind,
  targets,
  forms,
  prompt,
  explanation,
  answered,
  active = always,
  requirement = "required",
  allowUnknown = false,
  blocksPacket = true,
}: {
  id: string;
  answerKind: QuestionAnswerKind;
  targets: string[];
  forms: QuestionDefinition["affectedForms"];
  prompt: [string, string, string];
  explanation: [string, string, string];
  answered: (applicantCase: ApplicantCase) => boolean;
  active?: (applicantCase: ApplicantCase) => boolean;
  requirement?: QuestionRequirement;
  allowUnknown?: boolean;
  blocksPacket?: boolean;
}): QuestionDefinition {
  return {
    id,
    answerKind,
    requirement,
    allowUnknown,
    blocksPacket,
    canonicalTargets: targets,
    affectedForms: forms,
    prompt: localizedTuple(prompt),
    explanation: localizedTuple(explanation),
    isActive: active,
    isAnswered: answered,
  };
}

function collectionQuestion(
  id: keyof ApplicantCase["collectionCompletion"],
  answerKind: Extract<
    QuestionAnswerKind,
    "providers" | "medications" | "jobs" | "marriages" | "children"
  >,
  prompt: [string, string, string],
  forms: QuestionDefinition["affectedForms"],
  blocksPacket = true,
): QuestionDefinition {
  return question({
    id,
    answerKind,
    targets: [id],
    forms,
    prompt,
    explanation: [
      "A complete list prevents important application or evidence details from being left out.",
      "Una lista completa evita que falten datos importantes de la solicitud o de la evidencia.",
      "完整的清单可避免遗漏重要的申请或证据资料。",
    ],
    answered: (value) =>
      value.collectionCompletion[id] === "complete_none" ||
      value.collectionCompletion[id] === "complete_with_items",
    blocksPacket,
  });
}

function localizedTuple(
  values: [string, string, string],
): Record<SupportedLocale, string> {
  return {
    "en-US": values[0],
    "es-US": values[1],
    "zh-CN": values[2],
  };
}
