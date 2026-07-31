import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Stack, TextField, Button, Avatar, Chip,
  Divider, Alert, Skeleton, CircularProgress,
} from '@mui/material';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import { BRAND } from '../theme';
import http from '../http';
import { useUser, decodeToken } from '../contexts/UserContext';
import AppearanceSetting from '../components/AppearanceSetting';

const ROLE_BLURB = {
  resident: 'You can submit reports and track your own cases.',
  staff: 'You can manage flora, fauna, rodent risk and all resident cases.',
  admin: 'Full access, including estate settings and the weekly summary.',
};

function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function SectionCard({ icon: Icon, title, subtitle, children }) {
  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: subtitle ? 0.25 : 2 }}>
          <Box
            aria-hidden
            sx={{
              width: 34, height: 34, borderRadius: '8px', bgcolor: BRAND.section,
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}
          >
            <Icon sx={{ fontSize: 19, color: BRAND.accent }} />
          </Box>
          <Typography component="h2" sx={{ fontSize: 17, fontWeight: 700, color: BRAND.heading }}>
            {title}
          </Typography>
        </Stack>
        {subtitle && (
          <Typography sx={{ fontSize: 13.5, color: BRAND.textLight, mb: 2, ml: 6.25 }}>
            {subtitle}
          </Typography>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

export default function Profile() {
  const { user, setUser } = useUser();
  const [state, setState] = useState({ loading: true, error: null, profile: null });

  // details form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsMsg, setDetailsMsg] = useState(null);

  // password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    http.get('/api/auth/me')
      .then(r => {
        if (!alive) return;
        setState({ loading: false, error: null, profile: r.data });
        setName(r.data.name || '');
        setEmail(r.data.email || '');
      })
      .catch(e => {
        if (alive) setState({ loading: false, error: e.response?.data?.error || 'Could not load your profile.', profile: null });
      });
    return () => { alive = false; };
  }, []);

  const profile = state.profile;
  const dirty = profile && (name !== profile.name || email !== profile.email);

  async function saveDetails(e) {
    e.preventDefault();
    setSavingDetails(true);
    setDetailsMsg(null);
    try {
      const { data } = await http.patch('/api/auth/me', { name, email });
      // The API re-issues the token because `name` lives inside the JWT; storing it
      // is what keeps the nav bar and avatar in sync with the change.
      if (data.token) {
        localStorage.setItem('accessToken', data.token);
        setUser(decodeToken(data.token));
      }
      setState(s => ({ ...s, profile: data }));
      setName(data.name);
      setEmail(data.email);
      setDetailsMsg({ ok: true, text: 'Profile updated.' });
    } catch (err) {
      const detail = err.response?.data?.error;
      setDetailsMsg({ ok: false, text: Array.isArray(detail) ? detail.join(' ') : detail || 'Could not save your changes.' });
    } finally {
      setSavingDetails(false);
    }
  }

  const pwMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const pwTooShort = newPassword.length > 0 && newPassword.length < 6;
  const canSubmitPassword = currentPassword && newPassword && confirmPassword && !pwMismatch && !pwTooShort;

  async function savePassword(e) {
    e.preventDefault();
    if (!canSubmitPassword) return;
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      await http.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordMsg({ ok: true, text: 'Password updated. Other devices stay signed in until their session expires.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const detail = err.response?.data?.error;
      setPasswordMsg({ ok: false, text: Array.isArray(detail) ? detail.join(' ') : detail || 'Could not change your password.' });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <Box component="main" sx={{ maxWidth: 760, mx: 'auto', py: 4 }}>
      <Typography component="h1" sx={{ fontSize: { xs: 24, md: 28 }, fontWeight: 800, color: BRAND.heading, letterSpacing: '-0.6px' }}>
        My Profile
      </Typography>
      <Typography sx={{ fontSize: 14.5, color: BRAND.textLight, mt: 0.5, mb: 3 }}>
        Your account details, password and appearance preference.
      </Typography>

      {state.error && <Alert severity="error" sx={{ mb: 3 }}>{state.error}</Alert>}

      <Stack spacing={2.5}>
        {/* Identity summary */}
        <Card>
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 2 }}>
              <Avatar sx={{ width: 56, height: 56, bgcolor: BRAND.navy, color: '#fff', fontSize: 20, fontWeight: 800 }}>
                {initialsOf(profile?.name || user?.name)}
              </Avatar>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                {state.loading ? (
                  <>
                    <Skeleton variant="text" width={180} height={28} />
                    <Skeleton variant="text" width={220} />
                  </>
                ) : (
                  <>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                      <Typography sx={{ fontSize: 20, fontWeight: 700, color: BRAND.heading }}>
                        {profile?.name || user?.name}
                      </Typography>
                      <Chip
                        label={profile?.role || user?.role}
                        size="small"
                        sx={{ bgcolor: BRAND.navySoft, color: BRAND.heading, fontWeight: 700, textTransform: 'capitalize', fontSize: 12 }}
                      />
                    </Stack>
                    <Typography sx={{ fontSize: 13.5, color: BRAND.textLight }}>
                      {profile?.email}
                      {profile?.createdAt && ` · joined ${new Date(profile.createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </Typography>
                  </>
                )}
              </Box>
            </Stack>
            {!state.loading && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography sx={{ fontSize: 13, color: BRAND.textLight }}>
                  {ROLE_BLURB[profile?.role || user?.role] || 'Your access is set by an administrator.'}
                  {' '}Roles can only be changed by an administrator.
                </Typography>
              </>
            )}
          </CardContent>
        </Card>

        {/* Details */}
        <SectionCard icon={PersonOutlineRoundedIcon} title="Account details">
          <Box component="form" onSubmit={saveDetails}>
            <Stack spacing={2}>
              <TextField
                label="Full name"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={state.loading || savingDetails}
                fullWidth
                slotProps={{ htmlInput: { minLength: 2 } }}
              />
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={state.loading || savingDetails}
                fullWidth
                helperText="You sign in with this address."
              />
              {detailsMsg && <Alert severity={detailsMsg.ok ? 'success' : 'error'}>{detailsMsg.text}</Alert>}
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!dirty || savingDetails || state.loading || name.trim().length < 2}
                >
                  {savingDetails ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Save changes'}
                </Button>
                {dirty && !savingDetails && (
                  <Button
                    type="button"
                    variant="text"
                    onClick={() => { setName(profile.name); setEmail(profile.email); setDetailsMsg(null); }}
                    sx={{ color: BRAND.textLight }}
                  >
                    Discard
                  </Button>
                )}
              </Stack>
            </Stack>
          </Box>
        </SectionCard>

        {/* Password */}
        <SectionCard
          icon={LockOutlinedIcon}
          title="Password"
          subtitle="Changing your password requires your current one."
        >
          <Box component="form" onSubmit={savePassword}>
            <Stack spacing={2}>
              <TextField
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                disabled={savingPassword}
                fullWidth
              />
              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                disabled={savingPassword}
                error={pwTooShort}
                helperText={pwTooShort ? 'Must be at least 6 characters.' : 'At least 6 characters.'}
                fullWidth
              />
              <TextField
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                disabled={savingPassword}
                error={pwMismatch}
                helperText={pwMismatch ? 'Passwords do not match.' : ' '}
                fullWidth
              />
              {passwordMsg && <Alert severity={passwordMsg.ok ? 'success' : 'error'}>{passwordMsg.text}</Alert>}
              <Button type="submit" variant="contained" disabled={!canSubmitPassword || savingPassword} sx={{ alignSelf: 'flex-start' }}>
                {savingPassword ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Update password'}
              </Button>
            </Stack>
          </Box>
        </SectionCard>

        {/* Appearance - available to every role, not just admins */}
        <SectionCard
          icon={PaletteOutlinedIcon}
          title="Appearance"
          subtitle="Choose a light or dark colour scheme, or follow your device."
        >
          <AppearanceSetting />
        </SectionCard>
      </Stack>
    </Box>
  );
}
