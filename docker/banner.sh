# FeatherLab welcome banner. Installed as /etc/profile.d/featherlab-banner.sh, which login
# shells read: each terminal tab starts `bash -l`, so the banner shows once per tab and not
# again for a nested `bash`.
#
# Turning it off or switching the art (per learner, survives workstation upgrades):
#     echo off     > ~/.featherlab_banner     # no banner
#     echo f       > ~/.featherlab_banner     # Option A: lowercase f
#     echo feather > ~/.featherlab_banner     # Option B: feather (default)
#     rm ~/.featherlab_banner                 # back to the default
# FEATHERLAB_BANNER=off|f|feather in the environment wins over the file; set it with ENV in
# the Dockerfile to change the default for everyone. The learner's switch is a file because
# this runs before ~/.bashrc, so a variable exported there would arrive too late.
#
# Customising: `line1`/`line2` are the text, the `c*` values are colours ("38;2;R;G;B"),
# and the rows under `feather)` / `f)` are the art. Rows are plain strings: keep \ " $ and
# backticks out of them, and keep the widest row (art plus text) under `min_cols`.
#
# Plain POSIX sh, because /etc/profile can be read by shells other than bash. Everything is
# local to one function that is removed afterwards, so nothing leaks into the shell.

__fl_banner() {
  case $- in *i*) ;; *) return 0 ;; esac # not for scripts, `bash -c`, `bash -lc`
  [ -t 1 ] || return 0                    # not when output is piped or captured
  [ -z "${CI-}" ] || return 0

  local style line1 line2 min_cols cols esc r b d c1 c2 c3 q
  line1='Welcome to FeatherLab'
  line2='Learn by doing'
  min_cols=48

  style=${FEATHERLAB_BANNER-}
  if [ -z "$style" ] && [ -r "$HOME/.featherlab_banner" ]; then
    read -r style <"$HOME/.featherlab_banner"
  fi
  case $style in
    off | 0 | no | false | none) return 0 ;;
    f) ;;
    *) style=feather ;;
  esac

  # Too narrow for the art (it would wrap): text only. An unknown size counts as wide.
  cols=$(stty size 2>/dev/null)
  cols=${cols##* }
  case $cols in '' | *[!0-9]* | 0) cols=$min_cols ;; esac
  [ "$cols" -ge "$min_cols" ] || style=text

  r='' b='' d='' c1='' c2='' c3='' q=''
  if [ -z "${NO_COLOR-}" ] && [ "${TERM:-dumb}" != dumb ]; then
    esc=$(printf '\033')
    r="${esc}[0m"
    b="${esc}[1m"
    d="${esc}[38;2;150;158;166m"  # secondary text
    c1="${esc}[38;2;168;216;211m" # vane tip
    c2="${esc}[38;2;131;192;187m" # brand accent #83c0bb
    c3="${esc}[38;2;51;153;153m"  # feather icon #339999
    q="${esc}[38;2;204;102;102m"  # quill, terracotta #cc6666
  fi

  printf '\n'
  case $style in
    feather) # Option B (default)
      printf '%s\n' \
        "${c1}                       _,---." \
        "${c1}                 _.-;/////////)" \
        "${c2}             ,-;'////////////'" \
        "${c2}          ,;'/////////////-'" \
        "${c2}        ,'////////////.-'" \
        "${c3}       ////////////.-'" \
        "${c3}     ,'///////.--'${r}      ${b}${line1}${r}" \
        "${c3}    ///,.--''${r}           ${d}${line2}${r}" \
        "${q}  ,/'" \
        "${q} /${r}"
      ;;
    f) # Option A
      printf '%s\n' \
        "${c1}       ,--." \
        "${c1}      / ,-'" \
        "${c2}   __/ /__${r}      ${b}${line1}${r}" \
        "${c2}  '-/ /--'${r}      ${d}${line2}${r}" \
        "${c3}   / /" \
        "${c3},-/ /" \
        "${q}'--'${r}"
      ;;
    text) printf '%s\n' "${b}${line1}${r}" "${d}${line2}${r}" ;;
  esac
  printf '\n'
}
__fl_banner
unset -f __fl_banner
