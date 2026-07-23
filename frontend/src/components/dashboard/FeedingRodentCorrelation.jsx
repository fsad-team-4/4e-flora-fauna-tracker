import { useEffect, useState } from 'react';
import { Card, CardContent, Box, Stack, Typography, Chip, Skeleton, Divider } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { BRAND, CATEGORY_COLORS } from '../../theme';
import http from '../../http';

const FEEDING_INK = CATEGORY_COLORS.community_cat; // navy - the feeding (food-source) signal
const RODENT_INK = CATEGORY_COLORS.pest;           // magenta - the rodent signal

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

// One evidence figure: a big count + label, inked to its signal.
function Count({ value, label, color }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</Typography>
      <Typography sx={{ fontSize: 12, color: BRAND.textLight }}>{label}</Typography>
    </Box>
  );
}

function BlockRow({ block }) {
  const feedDate = fmtDate(block.firstFeedingDate);
  const rodentDate = fmtDate(block.firstRodentDate);
  // Ordering honesty: if feeding was first logged AFTER the rodent reports, the
  // sequence cannot support feeding as a driver - say so plainly.
  const feedTime = new Date(block.firstFeedingDate).getTime();
  const rodentTime = new Date(block.firstRodentDate).getTime();
  const feedingAfterRodent =
    !Number.isNaN(feedTime) && !Number.isNaN(rodentTime) && feedTime > rodentTime;

  return (
    <Box sx={{ py: 1.75 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700, color: BRAND.heading }}>
          {block.block_number}
        </Typography>
        <Chip
          label={`${block.sampleSize} record${block.sampleSize === 1 ? '' : 's'}`}
          size="small"
          sx={{ height: 20, fontSize: 11, bgcolor: BRAND.section, color: BRAND.textLight, fontWeight: 600 }}
        />
        {block.sampleSize < 10 && (
          <Typography sx={{ fontSize: 11.5, color: BRAND.textLight, fontStyle: 'italic' }}>
            small sample - not statistically significant
          </Typography>
        )}
      </Stack>

      {/* The two raw counts, side by side, as the evidence for the co-occurrence. */}
      <Stack direction="row" spacing={4} sx={{ flexWrap: 'wrap', rowGap: 1.5, mb: 1 }}>
        <Count value={block.feedingCount} label="feeding sightings" color={FEEDING_INK} />
        <Count value={block.rodentAssessmentCount} label="rodent reports" color={RODENT_INK} />
        <Count
          value={block.elevatedRodentCount}
          label="at elevated risk"
          color={block.elevatedRodentCount > 0 ? RODENT_INK : BRAND.textLight}
        />
      </Stack>

      {/* Timeline of the two signals, plus the ordering caveat when it applies. */}
      {(feedDate || rodentDate) && (
        <Typography sx={{ fontSize: 12.5, color: BRAND.textLight }}>
          Feeding first seen {feedDate || 'n/a'} · rodent reports from {rodentDate || 'n/a'}
        </Typography>
      )}
      {feedingAfterRodent && (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-start', mt: 0.75 }}>
          <WarningAmberRoundedIcon sx={{ fontSize: 16, color: '#8A5200', mt: '1px', flexShrink: 0 }} />
          <Typography sx={{ fontSize: 12.5, color: '#8A5200' }}>
            Feeding was first logged after the rodent reports here, so the ordering does not
            support feeding as a driver - treat as co-occurrence only.
          </Typography>
        </Stack>
      )}
    </Box>
  );
}

/**
 * Behavioural Diagnosis card. Shows blocks where feeding activity co-occurs with
 * rodent risk - the cross-domain pattern that hints at food waste as a root cause.
 *
 * Honesty is built in, not decorative: the card says "co-occurs with" (never
 * "causes"), shows the raw counts as the evidence (no synthesised confidence
 * score), flags small samples, and surfaces signal ordering. It fetches its own
 * endpoint so the whole cross-domain widget stays self-contained.
 */
export default function FeedingRodentCorrelation() {
  const [state, setState] = useState({ loading: true, error: false, windowDays: 30, blocks: [] });

  useEffect(() => {
    let alive = true;
    http.get('/api/block-diagnosis')
      .then(r => { if (alive) setState({ loading: false, error: false, windowDays: r.data.windowDays, blocks: r.data.blocks || [] }); })
      .catch(() => { if (alive) setState(s => ({ ...s, loading: false, error: true })); });
    return () => { alive = false; };
  }, []);

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Typography component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading }}>
          Behavioural Diagnosis
        </Typography>
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 2 }}>
          Blocks where feeding activity co-occurs with rodent risk over the last {state.windowDays} days -
          worth investigating for food waste as a root cause
        </Typography>

        {state.loading ? (
          <Stack spacing={1.5}>
            <Skeleton variant="rounded" height={72} />
            <Skeleton variant="rounded" height={72} />
          </Stack>
        ) : state.error ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 4, textAlign: 'center' }}>
            Diagnosis unavailable right now.
          </Typography>
        ) : state.blocks.length === 0 ? (
          <Typography variant="body2" sx={{ color: BRAND.textLight, py: 6, textAlign: 'center' }}>
            No blocks show both feeding and rodent signals in this window.
          </Typography>
        ) : (
          <>
            <Stack divider={<Divider flexItem />} sx={{ mb: 2 }}>
              {state.blocks.map(b => <BlockRow key={b.block_number} block={b} />)}
            </Stack>
            {/* Standing caveat: this is association, not proof. */}
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'flex-start', p: 1.5, bgcolor: BRAND.section, borderRadius: '8px' }}
            >
              <InfoOutlinedIcon sx={{ fontSize: 18, color: BRAND.textLight, mt: '1px', flexShrink: 0 }} />
              <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, lineHeight: 1.5 }}>
                These blocks show the two signals together; that is co-occurrence, not proven cause.
                The counts above are the raw evidence - confirm on the ground before acting, and prefer
                a feeding advisory over another pest call-out where food waste is plausible.
              </Typography>
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
}
