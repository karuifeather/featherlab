# FeatherLab learner shell defaults. Sourced from /etc/bash.bashrc, so every interactive
# shell gets them: each terminal tab (`bash -l`) and any nested `bash`.
#
# This lives in /etc on purpose. /home/learner is copied across workstation upgrades, so
# anything baked into ~/.bashrc would be replaced by the learner's older copy and never
# reach people who already have a workstation.

[[ $- == *i* ]] || return 0

# The exam hosts ship `kubectl` with the `k` alias and Bash autocompletion.
alias k=kubectl

if [[ -z ${BASH_COMPLETION_VERSINFO-} && -r /usr/share/bash-completion/bash_completion ]]; then
  . /usr/share/bash-completion/bash_completion
fi

# History is appended after every command (see __fl_prompt) instead of only on a clean
# exit: closing a tab or reloading the page drops the shell without giving it that chance,
# and several tabs would otherwise overwrite each other's history.
shopt -s histappend

# ── Remembered aliases ──────────────────────────────────────────────────────────────────
# An alias typed at the prompt is saved to ~/.featherlab_aliases and comes back in every
# later shell: other tabs, after a page reload, after switching exercises, after a
# workstation upgrade. Only what the learner changed is stored, as a delta on top of the
# rc files: `alias` lines for aliases they set, `unalias` lines for ones they removed.
#
# Tabs share the file. Each shell records only its own changes (compared with its last
# snapshot) and merges them into the file's current contents, so a tab that has been idle
# never erases an alias made in another one. A shell picks up the other tabs' changes at
# its next prompt.
__fl_alias_file=${FEATHERLAB_ALIAS_FILE:-$HOME/.featherlab_aliases}
declare -gA __fl_alias_snap=()
__fl_alias_seen=
__fl_alias_ready=

__fl_alias_snapshot() {
  local n
  __fl_alias_snap=()
  for n in "${!BASH_ALIASES[@]}"; do __fl_alias_snap[$n]=${BASH_ALIASES[$n]}; done
}

# Applies the saved file when its contents differ from what this shell last applied.
__fl_alias_load() {
  local content=
  [[ -r $__fl_alias_file ]] && content=$(<"$__fl_alias_file")
  [[ $content == "$__fl_alias_seen" ]] && return 0
  __fl_alias_seen=$content
  [[ -n $content ]] && eval "$content"
  __fl_alias_snapshot
}

# Merges this shell's changes (the caller's `added` and `removed`) into the saved file.
# Runs in a subshell so rebuilding the file's alias table never disturbs the live one.
__fl_alias_save() {
  local tmp=$__fl_alias_file.$$
  (
    declare -A new=() gone=()
    for n in "${added[@]}"; do new[$n]=${BASH_ALIASES[$n]}; done
    unalias -a
    if [[ -r $__fl_alias_file ]]; then
      while IFS= read -r line; do
        [[ $line == "unalias -- "* ]] || continue
        n=${line#unalias -- }
        gone[${n% 2>/dev/null}]=1
      done <"$__fl_alias_file"
      . "$__fl_alias_file" 2>/dev/null
    fi
    for n in "${added[@]}"; do
      alias -- "$n=${new[$n]}"
      unset "gone[$n]"
    done
    for n in "${removed[@]}"; do
      # Saved by the learner: dropping the line is enough. Otherwise it came from an rc
      # file, and only an explicit `unalias` keeps it away in the next shell.
      if [[ -n ${BASH_ALIASES[$n]+x} ]]; then unalias -- "$n"; else gone[$n]=1; fi
    done
    printf '# Aliases you set in the FeatherLab terminal. Saved automatically.\n'
    for n in "${!BASH_ALIASES[@]}"; do printf 'alias -- %s=%q\n' "$n" "${BASH_ALIASES[$n]}"; done
    for n in "${!gone[@]}"; do printf 'unalias -- %s 2>/dev/null\n' "$n"; done
  ) >"$tmp" 2>/dev/null && mv -f "$tmp" "$__fl_alias_file" 2>/dev/null
  rm -f "$tmp" 2>/dev/null
}

__fl_alias_sync() {
  # First prompt: every rc file has run, so the saved aliases are applied last and win
  # over ~/.bashrc. Nothing is written; this only sets the baseline.
  if [[ -z $__fl_alias_ready ]]; then
    __fl_alias_ready=1
    __fl_alias_load
    __fl_alias_snapshot
    return 0
  fi
  local n
  local -a added=() removed=()
  for n in "${!BASH_ALIASES[@]}"; do
    [[ -n ${__fl_alias_snap[$n]+x} && ${__fl_alias_snap[$n]} == "${BASH_ALIASES[$n]}" ]] ||
      added+=("$n")
  done
  for n in "${!__fl_alias_snap[@]}"; do
    [[ -n ${BASH_ALIASES[$n]+x} ]] || removed+=("$n")
  done
  if ((${#added[@]} + ${#removed[@]})); then
    __fl_alias_save
    __fl_alias_snapshot
  fi
  __fl_alias_load
}

# The prompt is `learner:~$`, without the host: the workstation's hostname is a random
# container id that means nothing to the learner. The stock prompt comes from ~/.bashrc,
# which runs after this file and is carried over on upgrade, so setting PS1 here would be
# overwritten. Instead the `@\h` is taken out of whatever PS1 the rc files produced, once,
# at the first prompt; a PS1 the learner sets later at the prompt is left alone.
__fl_ps1_ready=

# Builtins only on the common path: this runs before every prompt.
__fl_prompt() {
  local status=$?
  if [[ -z $__fl_ps1_ready ]]; then
    __fl_ps1_ready=1
    PS1=${PS1//@\\h/}
  fi
  history -a
  __fl_alias_sync
  return $status
}

case ";${PROMPT_COMMAND-};" in
  *";__fl_prompt;"*) ;;
  *) PROMPT_COMMAND="__fl_prompt${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
esac
