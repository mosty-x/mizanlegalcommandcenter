#!/bin/sh
# Trusted, administrator-installed wrapper. This file accepts no arbitrary command.
cd /opt/mizan || exit 1
exec /usr/bin/env node --env-file=/etc/mizan/receiver.env --conditions=react-server --import tsx /opt/mizan/ssh-server/mizan-workflow.mjs "$@"
