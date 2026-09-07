{{/*
Chart name.
*/}}
{{- define "clusterscope.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Release fullname.
*/}}
{{- define "clusterscope.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "clusterscope.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Namespace for all resources when single namespace mode is used.
*/}}
{{- define "clusterscope.singleNamespace" -}}
{{- .Values.namespaces.single }}
{{- end }}

{{/*
Frontend namespace.
*/}}
{{- define "clusterscope.frontendNamespace" -}}
{{- if eq .Values.namespaceMode "single" -}}
{{- .Values.namespaces.single }}
{{- else -}}
{{- .Values.namespaces.frontend }}
{{- end }}
{{- end }}

{{/*
Backend namespace.
*/}}
{{- define "clusterscope.backendNamespace" -}}
{{- if eq .Values.namespaceMode "single" -}}
{{- .Values.namespaces.single }}
{{- else -}}
{{- .Values.namespaces.backend }}
{{- end }}
{{- end }}

{{/*
Redis namespace.
*/}}
{{- define "clusterscope.redisNamespace" -}}
{{- if eq .Values.namespaceMode "single" -}}
{{- .Values.namespaces.single }}
{{- else -}}
{{- .Values.namespaces.redis }}
{{- end }}
{{- end }}

{{/*
Postgres namespace.
*/}}
{{- define "clusterscope.postgresNamespace" -}}
{{- if eq .Values.namespaceMode "single" -}}
{{- .Values.namespaces.single }}
{{- else -}}
{{- .Values.namespaces.postgres }}
{{- end }}
{{- end }}

{{/*
Gateway namespace.
*/}}
{{- define "clusterscope.gatewayNamespace" -}}
{{- if eq .Values.namespaceMode "single" -}}
{{- .Values.namespaces.single }}
{{- else -}}
{{- .Values.namespaces.gateway }}
{{- end }}
{{- end }}

{{/*
Backend service DNS.
*/}}
{{- define "clusterscope.backendHost" -}}
{{- if eq .Values.namespaceMode "single" -}}
clusterscope-backend.{{ .Values.namespaces.single }}.svc.cluster.local
{{- else -}}
clusterscope-backend.{{ .Values.namespaces.backend }}.svc.cluster.local
{{- end -}}
{{- end }}

{{/*
Redis service DNS.
*/}}
{{- define "clusterscope.redisHost" -}}
{{- if eq .Values.namespaceMode "single" -}}
clusterscope-redis.{{ .Values.namespaces.single }}.svc.cluster.local
{{- else -}}
clusterscope-redis.{{ .Values.namespaces.redis }}.svc.cluster.local
{{- end -}}
{{- end }}