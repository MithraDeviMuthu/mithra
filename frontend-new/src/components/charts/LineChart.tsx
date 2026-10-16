import React from "react";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const ACCENT_SHADES = [
  "#6E9BD6", // accent
  "#5E87BC", // accent-dark-1
  "#4E72A2", // accent-dark-2
  "#415E86", // accent-dark-3
  "#344A69", // accent-dark-4
];

export interface LineSeries {
  key: string;
  name: string;
  yAxisId?: "left" | "right";
  formatValue?: (value: number) => string;
}

interface LineChartProps<T = unknown> {
  data: T[];
  xKey: string;
  series: LineSeries[];
  title?: string;
  subtitle?: string;
  height?: number;
}

export function LineChart<T>({
  data,
  xKey,
  series,
  title,
  subtitle,
  height = 280,
}: LineChartProps<T>) {
  const hasRightAxis = series.some((s) => s.yAxisId === "right");

  return (
    <div className="card p-5">
      {title && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
          {subtitle && (
            <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
          )}
        </div>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsLineChart
            data={data}
            margin={{ top: 10, right: 10, left: -10, bottom: 10 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#232A38"
              vertical={false}
            />
            <XAxis
              dataKey={xKey}
              stroke="#6E7585"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              stroke="#6E7585"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
            />
            {hasRightAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#6E7585"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              />
            )}
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded-lg border border-border bg-bg-card p-3 shadow-lg min-w-[160px]">
                      <div className="text-xs font-semibold text-text-primary mb-2">
                        {String(label)}
                      </div>
                      <div className="space-y-1.5">
                        {payload.map((entry, idx) => {
                          const s = series.find((item) => item.key === entry.dataKey);
                          const val = Number(entry.value ?? 0);
                          const formatted = s?.formatValue ? s.formatValue(val) : String(val);
                          return (
                            <div
                              key={`tooltip-${idx}`}
                              className="flex items-center justify-between text-xs gap-3"
                            >
                              <span
                                className="flex items-center gap-1.5"
                                style={{ color: entry.color }}
                              >
                                <span
                                  className="h-2 w-2 rounded-full inline-block"
                                  style={{ backgroundColor: entry.color }}
                                />
                                {s?.name || entry.name}:
                              </span>
                              <span className="font-semibold text-text-primary">
                                {formatted}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: "12px", fontSize: "12px" }}
              iconType="circle"
            />
            {series.map((s, index) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                yAxisId={s.yAxisId || "left"}
                stroke={ACCENT_SHADES[index % ACCENT_SHADES.length]}
                strokeWidth={2}
                dot={{ r: 3, fill: ACCENT_SHADES[index % ACCENT_SHADES.length] }}
                activeDot={{ r: 5 }}
              />
            ))}
          </RechartsLineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
