FROM fanout/pushpin:latest

COPY pushpin.conf /etc/pushpin/pushpin.conf
COPY routes /etc/pushpin/routes

USER root
RUN chown pushpin:pushpin /etc/pushpin/pushpin.conf && chmod 666 /etc/pushpin/pushpin.conf

EXPOSE 7999 5560 5563
