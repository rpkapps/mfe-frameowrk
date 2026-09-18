import { useTheme, useUser } from '@company/mfe-react';
import { Link, useBlocker, useRouterState } from '@tanstack/react-router';
import { Badge } from '@tecton/react/components/badge';
import { Button, buttonVariants } from '@tecton/react/components/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tecton/react/components/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tecton/react/components/card';
import {
  CheckCircleOpenIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FacilityIcon,
  ListIcon,
  NodeIcon,
  PanelIcon,
  SeismicIcon,
  WarningIcon,
  WaterIcon,
} from '@tecton/react/icons';
import { AppShellBody, AppShellMain, AppShellSidebar } from '@tecton/react/tecton/app-shell';
import { PortalProvider } from '@tecton/react/tecton/portal';
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderNav,
  PageHeaderTitle,
} from '@tecton/react/tecton/page-header';
import { useCallback, useState } from 'react';
import { CompiledAdapterConsumer, UncompiledAdapterConsumer } from './compiler-consumers';
import { useTraceProbe } from '../trace-probe';

type Discipline = 'Subsurface' | 'Drilling' | 'Facilities';
type Decision = {
  title: string;
  value: string;
  discipline: Discipline;
  review?: boolean;
};

const alternatives = [
  { name: 'Existing tie-ins', code: '1.01', reference: true },
  { name: 'Satellite drill locations', code: '1.02', reference: false },
  { name: 'Phased drill locations', code: '1.03', reference: false },
  { name: 'Daisy chain umbilical', code: '1.04', reference: false },
] as const;

function decisionsFor(index: number): Decision[] {
  return [
    { title: 'Total well count', value: 'Minimum case', discipline: 'Subsurface' },
    {
      title: 'Drill locations',
      value: index === 0 ? 'Single cluster' : 'Distributed satellites',
      discipline: 'Subsurface',
      review: index === 1,
    },
    { title: 'Flowline tie-in point', value: 'Existing manifold', discipline: 'Drilling' },
    {
      title: 'Umbilical tie-in point',
      value: index === 0 ? 'Existing TUTA' : 'New TUTA',
      discipline: 'Facilities',
      review: index > 0,
    },
    { title: 'GL/WI/GI tie-in point', value: 'Existing manifold', discipline: 'Facilities' },
  ];
}

function DisciplineIcon({ discipline }: { discipline: Discipline }) {
  if (discipline === 'Subsurface') return <SeismicIcon size={15} />;
  if (discipline === 'Drilling') return <WaterIcon size={15} />;
  return <FacilityIcon size={15} />;
}

function DecisionCard({ decision }: { decision: Decision }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{decision.title}</CardDescription>
        <CardTitle>
          <h3>{decision.value}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={decision.review ? 'info' : 'success'}>
            {decision.review ? 'Ready for review' : 'Approved'}
          </Badge>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <DisciplineIcon discipline={decision.discipline} />
            {decision.discipline}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function DiscoveryScreen({ framing = false }: { framing?: boolean }) {
  const user = useUser();
  useTraceProbe('discovery');
  const theme = useTheme();
  const loadedUserId = useRouterState({
    select: (state) => {
      const loaderData = state.matches[state.matches.length - 1]?.loaderData;
      return (loaderData as { loadedUserId?: string } | undefined)?.loadedUserId;
    },
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState('1.01');
  const [showAll, setShowAll] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const shouldBlockNavigation = useCallback(() => {
    return hasUnsavedChanges;
  }, [hasUnsavedChanges]);
  const blocker = useBlocker({
    withResolver: true,
    shouldBlockFn: shouldBlockNavigation,
  });

  function toggleAlternative(code: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function selectAlternative(code: string) {
    setSelected(code);
    setShowAll(false);
    setSidebarOpen(false);
    setCollapsed((previous) => new Set([...previous].filter((item) => item !== code)));
  }

  return (
    <AppShellBody
      className="relative h-full bg-background text-sm text-foreground"
      data-testid="discovery-app"
    >
      {blocker.status === 'blocked' && (
        <PortalProvider container={portalContainer}>
          <Dialog
            isOpen
            showCloseButton={false}
            onOpenChange={(open) => {
              if (!open) blocker.reset?.();
            }}
          >
            <DialogHeader>
              <DialogTitle>Leave Discovery?</DialogTitle>
              <DialogDescription>Your current review will remain open here.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onPress={() => blocker.reset?.()}>
                Stay here
              </Button>
              <Button onPress={() => blocker.proceed?.()}>Leave Discovery</Button>
            </DialogFooter>
          </Dialog>
        </PortalProvider>
      )}
      <AppShellSidebar
        className={
          sidebarOpen
            ? 'absolute inset-y-0 left-0 z-10 p-4 shadow-xl md:static md:shadow-none'
            : 'hidden p-4 md:flex'
        }
        aria-label="Project details"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-medium">Project details</h2>
          <PanelIcon className="text-muted-foreground" size={19} />
        </div>
        <dl className="grid gap-3">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <Badge variant="outline">Ongoing</Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Asset</dt>
            <dd className="font-mono text-xs">Orion Hub</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Concepts</dt>
            <dd className="font-mono text-xs">3</dd>
          </div>
        </dl>
        <ol className="my-8 flex" aria-label="Project stage: DG1">
          {['DG0', 'DG1', 'DG2', 'DG3', 'DG4'].map((gate, index) => (
            <li
              key={gate}
              className="relative grid w-1/5 justify-items-center gap-2 text-xs text-muted-foreground"
            >
              <span
                aria-hidden="true"
                className={`size-3 rotate-45 border ${index < 2 ? 'border-primary bg-primary' : 'border-border'}`}
              />
              {index < 4 && (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 left-[calc(50%+8px)] h-px w-[calc(100%-16px)] bg-border"
                />
              )}
              {gate}
            </li>
          ))}
        </ol>
        <h3 className="mb-3 text-xs font-medium">Field development alternatives</h3>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onPress={() => setShowAll((value) => !value)}
        >
          <Badge variant="secondary">1</Badge>
          <span>Tie Back Concept</span>
          <small className="ml-auto font-mono text-xs text-muted-foreground">4 FDAs</small>
          {showAll ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </Button>
        <nav
          className="my-2 ml-3 grid gap-1 border-l border-border-subtle pl-3"
          aria-label="Field development alternatives"
        >
          {alternatives.map((alternative) => (
            <Button
              key={alternative.code}
              variant={!showAll && selected === alternative.code ? 'secondary' : 'ghost'}
              className="w-full justify-between"
              aria-current={!showAll && selected === alternative.code}
              onPress={() => selectAlternative(alternative.code)}
            >
              <span>{alternative.name}</span>
              <small className="font-mono text-xs text-muted-foreground">{alternative.code}</small>
            </Button>
          ))}
        </nav>
        <div className="flex min-h-9 items-center gap-2 px-2">
          <Badge variant="secondary">2</Badge>New Host Concept
          <small className="ml-auto font-mono text-xs text-muted-foreground">0 FDAs</small>
        </div>
        <div className="flex min-h-9 items-center gap-2 px-2">
          <Badge variant="secondary">3</Badge>Shared Host Lease
          <small className="ml-auto font-mono text-xs text-muted-foreground">0 FDAs</small>
        </div>
        <div
          className="mt-auto flex items-center gap-2 pt-8 text-xs text-muted-foreground"
          data-testid="discovery-session"
        >
          <span className="size-1.5 rounded-full bg-success" />
          {user?.name ?? 'Guest'} · {theme === 'dark' ? 'Dark' : 'Light'} theme
        </div>
      </AppShellSidebar>
      <AppShellMain className="p-3 sm:p-5 lg:p-6">
        <div ref={setPortalContainer} className="contents" />
        <div
          className="mb-3 flex flex-wrap items-center gap-2"
          data-testid="unsaved-change-control"
        >
          <Button
            variant={hasUnsavedChanges ? 'secondary' : 'outline'}
            aria-pressed={hasUnsavedChanges}
            onPress={() => setHasUnsavedChanges((value) => !value)}
          >
            {hasUnsavedChanges ? 'Mark review saved' : 'Make review unsaved'}
          </Button>
          <span role="status" data-testid="unsaved-change-state">
            {hasUnsavedChanges ? 'Unsaved review changes' : 'Review saved'}
          </span>
          <span data-testid="discovery-loader-context">Loaded for {loadedUserId ?? 'pending'}</span>
        </div>
        <div className="flex gap-2" aria-label="Compiler adapter consumers">
          <CompiledAdapterConsumer />
          <UncompiledAdapterConsumer />
        </div>
        <PageHeader className="mb-6">
          <Button
            className="md:hidden"
            variant="ghost"
            size="icon"
            aria-label="Toggle project details"
            aria-expanded={sidebarOpen}
            onPress={() => setSidebarOpen((value) => !value)}
          >
            <PanelIcon />
          </Button>
          <PageHeaderContent className="max-sm:basis-[calc(100%-3.75rem)]">
            <PageHeaderTitle>Orion Discovery</PageHeaderTitle>
          </PageHeaderContent>
          <PageHeaderNav aria-label="Project sections">
            <Link
              to="/"
              search
              className={buttonVariants({ variant: !framing ? 'secondary' : 'ghost' })}
              aria-current={!framing ? 'page' : undefined}
            >
              Overview
            </Link>
            <Link
              to="/framing"
              search
              className={buttonVariants({ variant: framing ? 'secondary' : 'ghost' })}
              aria-current={framing ? 'page' : undefined}
            >
              Framing
            </Link>
          </PageHeaderNav>
          {!framing && (
            <div className="flex items-center gap-1" aria-label="Alternative view">
              <Button
                variant={view === 'list' ? 'secondary' : 'ghost'}
                aria-pressed={view === 'list'}
                onPress={() => setView('list')}
              >
                <ListIcon />
                List
              </Button>
              <Button
                variant={view === 'graph' ? 'secondary' : 'ghost'}
                aria-pressed={view === 'graph'}
                onPress={() => setView('graph')}
              >
                <NodeIcon />
                Graph
              </Button>
            </div>
          )}
        </PageHeader>
        {framing ? (
          <Framing />
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <Badge variant="secondary">1</Badge>
              <h2 className="font-medium">Tie Back Concept</h2>
              <Badge variant="outline">Ongoing</Badge>
            </div>
            <section
              className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
              aria-label="Concept summary"
            >
              <Card size="sm">
                <CardHeader>
                  <CardDescription>
                    <h3>Key decisions</h3>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="divide-y divide-border-subtle">
                    {[
                      ['Reservoir', 'Orion West'],
                      ['Host', 'Orion FPSO'],
                      ['Drainage strategy', 'Depletion'],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                      >
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-mono text-xs">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardDescription>
                    <h3>Decisions</h3>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border-subtle font-mono text-xs">
                    <li className="flex items-center gap-2 pb-2">
                      <CheckCircleOpenIcon className="text-success" size={18} />
                      13 Approved
                    </li>
                    <li className="flex items-center gap-2 py-2">
                      <span className="mx-0.5 size-3.5 rounded-full border border-dashed border-info" />
                      5 Ready for review
                    </li>
                    <li className="flex items-center gap-2 pt-2">
                      <WarningIcon className="text-warning" size={18} />2 Need attention
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card size="sm" className="sm:col-span-2 xl:col-span-1">
                <CardHeader>
                  <CardDescription>
                    <h3>Description</h3>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="leading-relaxed">
                    Uses a cost-efficient subsea template at the Orion Alpha field to pipe raw
                    production back to the Orion FPSO for processing, using existing spare capacity
                    and minimising new infrastructure.
                  </p>
                </CardContent>
              </Card>
            </section>
            <Card size="sm" role="region" aria-label="Tie Back Concept alternatives">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>
                    <h2>Tie Back Concept</h2>
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={showAll}
                    onPress={() => setShowAll((value) => !value)}
                  >
                    {showAll ? '4 FDAs' : 'Show all 4 FDAs'}
                    <ChevronDownIcon />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {view === 'graph' ? (
                  <ConceptGraph selected={selected} onSelect={selectAlternative} />
                ) : (
                  <div className="grid gap-6">
                    {alternatives.map(
                      (alternative, index) =>
                        (showAll || selected === alternative.code) && (
                          <section
                            key={alternative.code}
                            className="border-l border-border-subtle pl-3"
                          >
                            <Button
                              variant="ghost"
                              className="mb-3 h-auto w-full flex-wrap justify-start gap-2 py-1 whitespace-normal text-left"
                              aria-expanded={!collapsed.has(alternative.code)}
                              onPress={() => toggleAlternative(alternative.code)}
                            >
                              <span>{alternative.name}</span>
                              <Badge variant="secondary">FDA {alternative.code}</Badge>
                              {alternative.reference && (
                                <Badge variant="outline">Reference case</Badge>
                              )}
                              <ChevronDownIcon
                                className={`ml-auto ${collapsed.has(alternative.code) ? '-rotate-90' : ''}`}
                              />
                            </Button>
                            {!collapsed.has(alternative.code) && (
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                                {decisionsFor(index).map((decision) => (
                                  <DecisionCard key={decision.title} decision={decision} />
                                ))}
                              </div>
                            )}
                          </section>
                        ),
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </AppShellMain>
    </AppShellBody>
  );
}

function Framing() {
  return (
    <section aria-label="Project framing">
      <div className="my-8 max-w-prose">
        <Badge variant="secondary">DG1 · Opportunity framing</Badge>
        <h2 className="mt-5 mb-3 text-3xl leading-tight font-medium">
          A shared frame for the next decision
        </h2>
        <p className="leading-relaxed text-muted-foreground">
          Connect the Orion West reservoirs to existing infrastructure while keeping options open
          for future development.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          [
            'Opportunity',
            'Develop Orion West',
            'Unlock recoverable resources across three prospects using the Orion FPSO as the existing host.',
          ],
          [
            'Success criteria',
            'Efficient first production',
            'Prioritise a phased development, robust recovery and a manageable infrastructure footprint.',
          ],
          [
            'Next decision',
            'Select a reference concept',
            'Review the four field development alternatives with Subsurface, Drilling and Facilities.',
          ],
        ].map(([label, title, description]) => (
          <Card size="sm" key={label}>
            <CardHeader>
              <CardDescription>
                <h3>{label}</h3>
              </CardDescription>
              <CardTitle>
                <h2>{title}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-relaxed">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Link to="/" className={buttonVariants({ variant: 'link', className: 'mt-6' })}>
        Return to concept overview <ChevronRightIcon size={17} />
      </Link>
    </section>
  );
}

function ConceptGraph({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div className="py-6 text-center">
      <div className="grid justify-items-center gap-3">
        <NodeIcon size={24} />
        <h3>Tie Back Concept</h3>
        <Badge variant="outline">Orion West → Orion FPSO</Badge>
      </div>
      <div className="mt-8 mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {alternatives.map((alternative) => (
          <Button
            key={alternative.code}
            variant={selected === alternative.code ? 'secondary' : 'outline'}
            className="h-auto min-h-36 flex-col gap-3 px-3 py-5 whitespace-normal"
            aria-pressed={selected === alternative.code}
            onPress={() => onSelect(alternative.code)}
          >
            <small className="text-xs">FDA {alternative.code}</small>
            <strong>{alternative.name}</strong>
            <span className="text-xs">
              {alternative.reference ? 'Reference case' : 'Development alternative'}
            </span>
          </Button>
        ))}
      </div>
      <p className="text-muted-foreground">
        Select an alternative, then switch to List to explore its decisions.
      </p>
    </div>
  );
}
