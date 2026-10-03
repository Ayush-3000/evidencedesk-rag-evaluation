import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
export default function RunChart({
  data,
  reduced,
}: {
  data: { name: string; rate?: number; id: string }[];
  reduced: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{
          top: 15,
          right: 20,
          bottom: 0,
          left: -20,
        }}
      >
        <defs>
          <linearGradient id="quality-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis
          dataKey="name"
          stroke="var(--muted)"
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v) => `${v}%`}
          stroke="var(--muted)"
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            color: "var(--text)",
          }}
          formatter={(v) => [`${v}%`, "Fixture pass rate"]}
        />
        <Area
          type="monotone"
          dataKey="rate"
          stroke="var(--accent)"
          strokeWidth={2.5}
          fill="url(#quality-fill)"
          dot={{
            r: 5,
            fill: "var(--accent)",
            stroke: "var(--surface)",
          }}
          isAnimationActive={!reduced}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
