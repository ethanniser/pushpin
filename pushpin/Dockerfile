FROM fanout/pushpin:latest

COPY pushpin/pushpin.conf /etc/pushpin/pushpin.conf
COPY pushpin/routes /etc/pushpin/routes

USER root
RUN chown pushpin:pushpin /etc/pushpin/pushpin.conf && chmod 666 /etc/pushpin/pushpin.conf

EXPOSE 7999 5560 5563
