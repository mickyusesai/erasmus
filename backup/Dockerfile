FROM postgres:16-alpine

# aws-cli v1 — small footprint, all we need for s3 cp
RUN apk add --no-cache aws-cli

COPY backup.sh /backup.sh
RUN chmod +x /backup.sh

CMD ["/backup.sh"]
