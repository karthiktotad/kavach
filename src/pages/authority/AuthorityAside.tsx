import { Card, Icon, UnverifiedTag } from '../../components/ui'
import type { CommunityReportItem, ZoneCheckinMetric } from './types'

export interface AuthorityAsideProps {
  readonly reports: readonly CommunityReportItem[]
  readonly checkinMetrics: readonly ZoneCheckinMetric[]
  readonly onOfficialConfirm: (report: CommunityReportItem) => void
}

export function AuthorityAside({
  reports,
  checkinMetrics,
  onOfficialConfirm,
}: AuthorityAsideProps) {
  return (
    <aside className="w-full lg:w-[300px] shrink-0 space-y-4">
      {/* 1. Live Community Reports Section */}
      <Card className="p-4 space-y-3 border-line shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <div className="flex items-center gap-1.5">
            <Icon name="waves" className="h-4 w-4 text-drill" />
            <h3 className="text-xs font-black uppercase tracking-wider text-ink">
              Community Reports
            </h3>
          </div>
          <span className="rounded-full bg-drill/10 text-drill font-mono text-[10px] font-extrabold px-2 py-0.5">
            {reports.length} incoming
          </span>
        </div>

        <p className="text-[11px] font-medium text-ink-muted">
          Unverified crowd observations. You must review and officially confirm before broadcast.
        </p>

        <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
          {reports.length === 0 ? (
            <div className="py-6 text-center text-xs font-medium text-ink-muted">
              No pending community reports.
            </div>
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className="rounded-12 border border-line bg-surface-sunken p-3 space-y-2 text-xs hover:border-drill/50 transition-colors"
                data-testid={`aside-report-${report.id}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-ink uppercase">
                        {report.kind}
                      </span>
                      <UnverifiedTag />
                    </div>
                    <span className="text-[11px] font-bold text-ink-muted">
                      {report.zoneName} ({report.zoneId})
                    </span>
                  </div>

                  <span className="rounded-8 bg-surface px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand border border-line">
                    {report.confidence}% trust
                  </span>
                </div>

                <p className="text-xs text-ink font-medium line-clamp-2">
                  "{report.note}"
                </p>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/60 text-[10px] text-ink-muted font-medium">
                  <span>{report.confirmationsCount} confirmations · GPS verified</span>
                  <button
                    type="button"
                    onClick={() => onOfficialConfirm(report)}
                    className="font-black text-verified hover:underline flex items-center gap-1 cursor-pointer"
                    data-testid={`report-confirm-btn-${report.id}`}
                  >
                    <span>Official confirm</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* 2. Aggregated Check-ins by Zone */}
      <Card className="p-4 space-y-3 border-line shadow-sm">
        <div className="flex items-center justify-between border-b border-line pb-2">
          <div className="flex items-center gap-1.5">
            <Icon name="check-circle" className="h-4 w-4 text-live" />
            <h3 className="text-xs font-black uppercase tracking-wider text-ink">
              Check-ins by Zone
            </h3>
          </div>
          <span className="rounded-full bg-live-tint text-live font-mono text-[10px] font-extrabold px-2 py-0.5">
            Live
          </span>
        </div>

        {/* Privacy Note */}
        <div className="flex items-center gap-1.5 rounded-8 bg-surface-sunken p-2 text-[10px] font-semibold text-ink-muted">
          <Icon name="lock" className="h-3.5 w-3.5 text-verified shrink-0" />
          <span>No names, phone numbers or exact positions.</span>
        </div>

        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {checkinMetrics.map((metric) => (
            <div
              key={metric.zoneId}
              className={`rounded-10 border p-2.5 space-y-1.5 text-xs ${
                metric.dropDetected
                  ? 'border-danger/40 bg-danger/5'
                  : 'border-line bg-surface'
              }`}
            >
              <div className="flex items-center justify-between font-bold">
                <span className="text-ink">{metric.zoneName}</span>
                <span className="font-mono text-ink-muted text-[11px]">
                  {metric.totalCheckins} total
                </span>
              </div>

              {/* Status breakdown bar */}
              <div className="flex items-center gap-2 text-[11px] font-semibold">
                <span className="text-live flex items-center gap-0.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-live" />
                  {metric.safeCount} safe
                </span>
                {metric.needHelpCount > 0 && (
                  <span className="text-danger flex items-center gap-0.5 font-bold">
                    <span className="inline-block h-2 w-2 rounded-full bg-danger" />
                    {metric.needHelpCount} need help
                  </span>
                )}
                {metric.evacuatingCount > 0 && (
                  <span className="text-drill flex items-center gap-0.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-drill" />
                    {metric.evacuatingCount} moving
                  </span>
                )}
              </div>

              {/* Drop alert indicator */}
              {metric.dropDetected && (
                <div className="text-[10px] font-extrabold text-danger flex items-center gap-1 pt-0.5">
                  <Icon name="warning" className="h-3 w-3" />
                  <span>Check-in drop detected (potential outage)</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </aside>
  )
}
