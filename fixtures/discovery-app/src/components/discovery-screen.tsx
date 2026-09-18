import { useTheme, useUser } from '@company/mfe-react';
import { Link } from '@tanstack/react-router';
import { Badge } from '@tecton/react/components/badge';
import { Button } from '@tecton/react/components/button';
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
import { PageHeader, PageHeaderContent, PageHeaderTitle } from '@tecton/react/tecton/page-header';
import { useState } from 'react';

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
    <article className="discovery-decision">
      <p className="discovery-muted">{decision.title}</p>
      <h3>{decision.value}</h3>
      <div className="discovery-decision-meta">
        <Badge variant={decision.review ? 'info' : 'success'}>
          {decision.review ? 'Ready for review' : 'Approved'}
        </Badge>
        <span className="discovery-discipline">
          <DisciplineIcon discipline={decision.discipline} />
          {decision.discipline}
        </span>
      </div>
    </article>
  );
}

export function DiscoveryScreen({ framing = false }: { framing?: boolean }) {
  const user = useUser();
  const theme = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState('1.01');
  const [showAll, setShowAll] = useState(true);

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
    <AppShellBody className="discovery-app" data-testid="discovery-app">
      <AppShellSidebar
        className={`discovery-sidebar ${sidebarOpen ? 'discovery-sidebar-open' : ''}`}
        aria-label="Project details"
      >
        <div className="discovery-sidebar-heading">
          <h2>Project details</h2>
          <PanelIcon size={19} />
        </div>
        <dl className="discovery-project-facts">
          <div>
            <dt>Status</dt>
            <dd>
              <Badge variant="outline">Ongoing</Badge>
            </dd>
          </div>
          <div>
            <dt>Asset</dt>
            <dd>Orion Hub</dd>
          </div>
          <div>
            <dt>Concepts</dt>
            <dd>3</dd>
          </div>
        </dl>
        <ol className="discovery-gates" aria-label="Project stage: DG1">
          {['DG0', 'DG1', 'DG2', 'DG3', 'DG4'].map((gate, index) => (
            <li key={gate} className={index < 2 ? 'discovery-gate-complete' : ''}>
              <span aria-hidden="true" />
              {gate}
            </li>
          ))}
        </ol>
        <h3 className="discovery-sidebar-label">Field development alternatives</h3>
        <button className="discovery-concept-link" onClick={() => setShowAll((value) => !value)}>
          <span className="discovery-index">1</span>
          <span>Tie Back Concept</span>
          <small>4 FDAs</small>
          {showAll ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
        </button>
        <nav className="discovery-alternatives" aria-label="Field development alternatives">
          {alternatives.map((alternative) => (
            <button
              key={alternative.code}
              aria-current={!showAll && selected === alternative.code ? 'true' : undefined}
              onClick={() => selectAlternative(alternative.code)}
            >
              <span>{alternative.name}</span>
              <small>{alternative.code}</small>
            </button>
          ))}
        </nav>
        <div className="discovery-empty-concept">
          <span className="discovery-index">2</span>New Host Concept<small>0 FDAs</small>
        </div>
        <div className="discovery-empty-concept">
          <span className="discovery-index">3</span>Shared Host Lease<small>0 FDAs</small>
        </div>
        <div className="discovery-sidebar-footer" data-testid="discovery-session">
          <span className="discovery-live-dot" />
          {user?.name ?? 'Guest'} · {theme === 'dark' ? 'Dark' : 'Light'} theme
        </div>
      </AppShellSidebar>
      <AppShellMain className="discovery-main">
        <PageHeader className="discovery-page-header">
          <Button
            className="discovery-sidebar-toggle"
            variant="ghost"
            size="icon"
            aria-label="Toggle project details"
            aria-expanded={sidebarOpen}
            onPress={() => setSidebarOpen((value) => !value)}
          >
            <PanelIcon />
          </Button>
          <PageHeaderContent>
            <PageHeaderTitle>Orion Discovery</PageHeaderTitle>
          </PageHeaderContent>
          <nav className="discovery-tabs" aria-label="Project sections">
            <Link
              to="/"
              className={!framing ? 'discovery-tab-active' : ''}
              aria-current={!framing ? 'page' : undefined}
            >
              Overview
            </Link>
            <Link
              to="/framing"
              className={framing ? 'discovery-tab-active' : ''}
              aria-current={framing ? 'page' : undefined}
            >
              Framing
            </Link>
          </nav>
          {!framing && (
            <div className="discovery-view-switch" aria-label="Alternative view">
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
            <div className="discovery-section-heading">
              <span className="discovery-index">1</span>
              <h2>Tie Back Concept</h2>
              <Badge variant="outline">Ongoing</Badge>
            </div>
            <section className="discovery-summary" aria-label="Concept summary">
              <article className="discovery-summary-card">
                <h3>Key decisions</h3>
                <dl>
                  <div>
                    <dt>Reservoir</dt>
                    <dd>Orion West</dd>
                  </div>
                  <div>
                    <dt>Host</dt>
                    <dd>Orion FPSO</dd>
                  </div>
                  <div>
                    <dt>Drainage strategy</dt>
                    <dd>Depletion</dd>
                  </div>
                </dl>
              </article>
              <article className="discovery-summary-card">
                <h3>Decisions</h3>
                <ul className="discovery-status-list">
                  <li>
                    <CheckCircleOpenIcon className="discovery-approved" size={18} />
                    13 Approved
                  </li>
                  <li>
                    <span className="discovery-review-dot" />5 Ready for review
                  </li>
                  <li>
                    <WarningIcon className="discovery-warning" size={18} />2 Need attention
                  </li>
                </ul>
              </article>
              <article className="discovery-summary-card">
                <h3>Description</h3>
                <p>
                  Uses a cost-efficient subsea template at the Orion Alpha field to pipe raw
                  production back to the Orion FPSO for processing, using existing spare capacity
                  and minimising new infrastructure.
                </p>
              </article>
            </section>
            <section className="discovery-concept" aria-label="Tie Back Concept alternatives">
              <div className="discovery-concept-heading">
                <h2>Tie Back Concept</h2>
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
              {view === 'graph' ? (
                <ConceptGraph selected={selected} onSelect={selectAlternative} />
              ) : (
                <div className="discovery-alternative-list">
                  {alternatives.map(
                    (alternative, index) =>
                      (showAll || selected === alternative.code) && (
                        <section key={alternative.code} className="discovery-alternative">
                          <button
                            className="discovery-alternative-heading"
                            aria-expanded={!collapsed.has(alternative.code)}
                            onClick={() => toggleAlternative(alternative.code)}
                          >
                            <span>{alternative.name}</span>
                            <Badge variant="secondary">FDA {alternative.code}</Badge>
                            {alternative.reference && (
                              <Badge variant="outline">Reference case</Badge>
                            )}
                            <ChevronDownIcon
                              className={
                                collapsed.has(alternative.code) ? 'discovery-chevron-closed' : ''
                              }
                              size={18}
                            />
                          </button>
                          {!collapsed.has(alternative.code) && (
                            <div className="discovery-decision-grid">
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
            </section>
          </>
        )}
      </AppShellMain>
    </AppShellBody>
  );
}

function Framing() {
  return (
    <section className="discovery-framing" aria-label="Project framing">
      <div className="discovery-framing-intro">
        <Badge variant="secondary">DG1 · Opportunity framing</Badge>
        <h2>A shared frame for the next decision</h2>
        <p>
          Connect the Orion West reservoirs to existing infrastructure while keeping options open
          for future development.
        </p>
      </div>
      <div className="discovery-framing-grid">
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
          <article className="discovery-summary-card" key={label}>
            <h3>{label}</h3>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </div>
      <Link to="/" className="discovery-return-link">
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
    <div className="discovery-graph">
      <div className="discovery-graph-root">
        <NodeIcon size={24} />
        <h3>Tie Back Concept</h3>
        <Badge variant="outline">Orion West → Orion FPSO</Badge>
      </div>
      <div className="discovery-graph-branches">
        {alternatives.map((alternative) => (
          <button
            key={alternative.code}
            aria-pressed={selected === alternative.code}
            onClick={() => onSelect(alternative.code)}
          >
            <small>FDA {alternative.code}</small>
            <strong>{alternative.name}</strong>
            <span>{alternative.reference ? 'Reference case' : 'Development alternative'}</span>
          </button>
        ))}
      </div>
      <p className="discovery-muted">
        Select an alternative, then switch to List to explore its decisions.
      </p>
    </div>
  );
}
