#!/bin/sh
# Run on the Ubuntu host with: sudo env SSH_PORT=22 sh deploy/harden-ubuntu.sh
set -eu
test "$(id -u)" = 0 || { echo 'Run as root.' >&2; exit 1; }
ssh_port=${SSH_PORT:?Set SSH_PORT to the working SSH port before enabling the firewall}
case "$ssh_port" in ''|*[!0-9]*) echo 'Invalid SSH_PORT' >&2; exit 1;; esac
test "$ssh_port" -ge 1 && test "$ssh_port" -le 65535
if ! command -v ufw >/dev/null || ! command -v fail2ban-client >/dev/null; then
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y ufw fail2ban
fi
snapshot=/var/backups/nomad-city-security/$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$snapshot"
cp -a /etc/ufw "$snapshot/ufw"
cp -a /etc/fail2ban/jail.d "$snapshot/jail.d"
ufw status verbose > "$snapshot/ufw-status.txt"
# Preserve existing rules and explicitly permit the working SSH port first.
ufw allow "$ssh_port/tcp" comment 'SSH administration'
ufw allow 80/tcp comment 'Nomad City HTTP and ACME'
ufw allow 443/tcp comment 'Nomad City HTTPS'
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
cat > /etc/fail2ban/jail.d/nomad-city-sshd.local <<EOF
[sshd]
enabled = true
backend = systemd
port = $ssh_port
banaction = ufw
maxretry = 5
findtime = 10m
bantime = 1h
bantime.increment = true
EOF
fail2ban-client -t
systemctl enable --now fail2ban
systemctl restart fail2ban
systemctl is-active --quiet fail2ban
ufw status verbose
printf 'Host security applied. Previous configuration: %s\n' "$snapshot"
