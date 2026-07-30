import { CollapsibleSection } from "./admin/AdminSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ScratchSectionPreview() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <CollapsibleSection title="Activity Log" description="Recent authentication events and user activity">
          <Card><CardContent className="pt-6">Activity content</CardContent></Card>
        </CollapsibleSection>

        <CollapsibleSection
          title="POS Products"
          description="Manage products available in the POS system."
          headerAction={<Button size="sm">Add Product</Button>}
        >
          <Card><CardContent className="pt-6">Products</CardContent></Card>
        </CollapsibleSection>

        <CollapsibleSection title="Access & Messaging" description="Door access codes and SMS templates" defaultOpen>
          <div className="space-y-4">
            <CollapsibleSection title="Door Access" description="Keypad codes: fixed, daily, or unique per booking" defaultOpen>
              <p className="text-sm">Door access settings body.</p>
            </CollapsibleSection>
            <CollapsibleSection title="SMS Templates" description="Customize SMS notification templates">
              <p className="text-sm">SMS body.</p>
            </CollapsibleSection>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Operating Hours" description="Set business operating hours and staffed hours per day">
          <p>hours</p>
        </CollapsibleSection>
      </div>
    </div>
  );
}
