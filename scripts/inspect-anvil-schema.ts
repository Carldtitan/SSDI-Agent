import Anvil from "@anvilco/anvil";

const templates = {
  ssa16: process.env.ANVIL_EID_SSA16,
  ssa3368: process.env.ANVIL_EID_SSA3368,
  ssa3369: process.env.ANVIL_EID_SSA3369,
  ssa827: process.env.ANVIL_EID_SSA827,
};

const query = `
  query InspectCast($eid: String) {
    cast(eid: $eid) {
      eid
      exampleData
      fieldInfo
    }
  }
`;

async function main() {
  const apiKey = process.env.ANVIL_API_KEY;
  if (!apiKey) throw new Error("ANVIL_API_KEY is missing");
  const client = new Anvil({ apiKey });
  for (const [name, eid] of Object.entries(templates)) {
    if (!eid) throw new Error(`Missing EID for ${name}`);
    const result = await client.requestGraphQL({
      query,
      variables: { eid },
    });
    const cast = result.data?.data?.cast;
    const radioGroups = (
      (cast?.fieldInfo as {
        fields?: Array<{
          id: string;
          type: string;
          options?: Record<string, string>;
        }>;
      })?.fields ?? []
    )
      .filter((field) => field.type === "radioGroup")
      .map((field) => ({
        id: field.id,
        options: field.options,
        example: (cast?.exampleData as Record<string, unknown>)?.[field.id],
      }));
    process.stdout.write(
      `${JSON.stringify({ name, radioGroups })}\n`,
    );
  }
}

main().catch(() => {
  process.stderr.write(
    "Schema inspection failed without exposing template credentials.",
  );
  process.exitCode = 1;
});
