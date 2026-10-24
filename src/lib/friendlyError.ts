// Turn Supabase's technical error messages into plain, friendly language.
export function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "That email and password don't match. Please check them and try again.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email first. Look in your inbox for our message and tap the link inside.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "There is already an account with this email. Try logging in instead.";
  if (m.includes("password should be") || m.includes("password is too"))
    return "Please choose a longer password, with at least 6 letters or numbers.";
  if (m.includes("same password") || m.includes("different from the old"))
    return "Your new password must be different from your old one.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes"))
    return "We've had a lot of tries just now. Please wait a few minutes, then try again.";
  if (m.includes("not authorized") || m.includes("sending") || m.includes("smtp"))
    return "Sorry, we can't send emails from CareNest yet. Please contact the CareNest team for help.";
  if (m.includes("invalid email") || m.includes("unable to validate email"))
    return "That doesn't look like an email address. It should look like name@example.com.";
  if (m.includes("email address") && m.includes("invalid"))
    return "We can't use that email address. Please check it, or try a different one.";
  if (m.includes("session missing") || m.includes("expired") || m.includes("access_denied"))
    return "That email link has run out or was already used. Please try logging in, or ask us for a new link.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "We couldn't connect. Please check your internet connection and try again.";
  return "Sorry, something went wrong. Please try again.";
}
