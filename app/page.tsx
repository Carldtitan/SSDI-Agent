import { CaseProvider } from "@/components/app/case-context";
import { Workspace } from "@/components/app/workspace";

export default function HomePage() {
  return (
    <CaseProvider>
      <Workspace />
    </CaseProvider>
  );
}
