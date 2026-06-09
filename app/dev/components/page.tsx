import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Input, Textarea, Label } from "@/components/ui/Input";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Atlas — component showcase" };

export default function ComponentsShowcase() {
  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto max-w-4xl space-y-10 px-6 py-12">
        <header className="flex items-center justify-between">
          <div>
            <Logo />
            <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight">
              Tier-1 components
            </h1>
            <p className="mt-1 text-md text-text-2">
              The starter design-system set (ATL-018), wired to the Atlas
              tokens.
            </p>
          </div>
          <ButtonLink href="/" variant="secondary">
            ← Home
          </ButtonLink>
        </header>

        <Group title="Button">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="brand">Brand</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
        </Group>

        <Group title="Badge">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">Neutral</Badge>
            <Badge tone="brand">Brand</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="danger">Danger</Badge>
            <Badge tone="outline">Outline</Badge>
          </div>
        </Group>

        <Group title="Score badge">
          <div className="flex items-center gap-3">
            <ScoreBadge score={8.7} />
            <ScoreBadge score={7.1} />
            <ScoreBadge score={5.6} />
            <ScoreBadge score={8.7} size="lg" />
          </div>
        </Group>

        <Group title="Avatar">
          <div className="flex items-center gap-3">
            <Avatar name="Priya Nair" size="sm" />
            <Avatar name="Marcus Ortega" size="md" />
            <Avatar name="Dana Whitfield" size="lg" />
          </div>
        </Group>

        <Group title="Progress bar">
          <div className="max-w-sm space-y-3">
            <ProgressBar value={25} />
            <ProgressBar value={63} tone="brand" />
            <ProgressBar value={90} tone="success" />
            <ProgressBar value={40} tone="warning" />
          </div>
        </Group>

        <Group title="Input">
          <div className="max-w-sm space-y-3">
            <div>
              <Label htmlFor="email">Work email</Label>
              <Input id="email" placeholder="you@company.com" />
            </div>
            <div>
              <Label htmlFor="note">Note</Label>
              <Textarea id="note" rows={3} placeholder="Type a note…" />
            </div>
          </div>
        </Group>

        <Group title="Card">
          <Card className="max-w-sm">
            <CardHeader>
              <CardTitle>Card title</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-md text-text-2">
                Cards are the default container for grouped content across the
                app.
              </p>
            </CardBody>
          </Card>
        </Group>
      </div>
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-text-3">
        {title}
      </h2>
      <div className="rounded-lg border border-border bg-surface p-6">
        {children}
      </div>
    </section>
  );
}
