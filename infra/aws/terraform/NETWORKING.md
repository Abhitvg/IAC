# CareerOps AWS network configuration

This Terraform root reuses the existing VPC and subnet resources in account
165328640460, region ap-southeast-2. It does not create or modify the VPC,
subnets, Internet Gateway, or S3 Gateway VPC endpoint.

## Existing network inputs

- VPC: `vpc-0bc0cb5d78fb32a15`
- Public AZ-a: `subnet-06d11260177d2cc26` (`10.0.0.0/20`)
- Public AZ-b: `subnet-0442bc7a85c52a118` (`10.0.16.0/20`)
- Private AZ-a: `subnet-094d092843afe015e` (`10.0.128.0/20`)
- Private AZ-b: `subnet-0d1956f455dd5e05d` (`10.0.144.0/20`)
- Public route table: `rtb-03aa6df3d0020194b`
- Private route tables, in matching AZ order:
  - AZ-a: `rtb-024d3e164c8789f0a`
  - AZ-b: `rtb-06cc31d3e822913e8`
- Existing S3 Gateway endpoint route in both private route tables:
  `pl-6ca54005 -> vpce-04f63de0a856d65dc`

The public route table already has `0.0.0.0/0 -> igw-0e30a3e701be83780`.
The private route tables currently have no default route. Terraform adds the
private default routes through the NAT Gateway resources defined here.

## Environment behavior

Set `environment = "staging"` for the staging footprint:

- One NAT Gateway and one Elastic IP in the first public subnet (AZ-a).
- Both private route tables use that NAT Gateway for default IPv4 egress.
- This is a cost-saving staging arrangement; AZ-b egress depends on AZ-a NAT.

Set `environment = "production"` for production:

- Two NAT Gateways and two Elastic IPs, one in each public subnet/AZ.
- Each private route table uses its same-AZ NAT Gateway.
- Production still requires HTTPS and a valid ACM certificate.

Staging and production must use **separate Terraform state backends/workspaces
with independent state and locking**. Do not switch the environment variable
inside a shared state: the environment name is part of resource naming and
the NAT count changes between environments.

## Database network isolation

The current deployment reuses the two private application subnets for the RDS
subnet group. This keeps RDS non-public and security-group restricted, but it
does not provide separate database route-table isolation. A hardened follow-up
should allocate dedicated database subnets and route tables with no default
internet route, then update `database_subnet_ids`.

## Costs and operational boundaries

NAT Gateways and their Elastic IPs incur ongoing AWS charges, including hourly
and data-processing charges. One NAT Gateway is cheaper but introduces an
AZ dependency for staging. Two NAT Gateways improve production AZ independence
but cost more. Review current regional pricing before applying.

This document describes Terraform configuration only. It does not mean any
AWS resources have been provisioned. Do not run `terraform apply` without an
explicit infrastructure-change approval and a reviewed plan.
