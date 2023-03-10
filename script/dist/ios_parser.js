"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IosParser = void 0;
class IosParser {
    constructor() {
        this.vlan_prefix = "vlan";
        this.syslog = [];
        this.radius_auth = [];
        this.radius_acct = [];
        this.tacacs = [];
        this.ntp = [];
        this.dns = [];
        this.domain = [];
        this.vlans = {};
        this.banner = "";
        this.dhcp_snooping_vlans = [];
        this.port_profile_configs = [];
        this.port_profile_names = [];
        this.all_port_profile_names = [];
        this.ios_descriptions = [];
        this.ios_config = [];
        this.vlan_ids_to_exclude = ["1002", "1003", "1004", "1005"];
    }
    parse_config(config) {
        return new Promise((resolve) => {
            var config_block = [];
            var config_type = undefined;
            config.forEach((line) => {
                if (config_type == "banner" && !line.startsWith("^C")) {
                    config_block.push(line);
                }
                else if (config_type && line.startsWith(" ")) {
                    config_block.push(line);
                }
                else if (config_type) {
                    switch (config_type) {
                        case "radius":
                            this.parse_radius(config_block);
                            break;
                        case "tacacs":
                            this.parse_tacacs(config_block);
                            break;
                        case "dhcp_snooping":
                            break;
                        case "port_profiles":
                            this.parse_interface(config_block);
                            break;
                        case "banner":
                            this.banner = config_block.join("\n");
                            break;
                    }
                    config_block = [];
                    config_type = undefined;
                }
                if (line.startsWith("interface "))
                    config_type = "port_profiles";
                else if (line.startsWith("radius server "))
                    config_type = "radius";
                else if (line.startsWith("tacacs server "))
                    config_type = "tacacs";
                else if (line.startsWith("ip name-server "))
                    this.parse_dns(line);
                else if (line.startsWith("ip domain name "))
                    this.parse_domain(line);
                else if (line.startsWith("ntp server "))
                    this.parse_ntp(line);
                else if (line.startsWith("logging host "))
                    this.parse_syslog(line);
                else if (line.startsWith("ip dhcp snooping "))
                    this.parse_dhcp_snooping(line);
                else if (line.startsWith("banner motd"))
                    config_type = "banner";
            });
            resolve(true);
        });
    }
    parse_vlans(vlan_conf) {
        return new Promise((resolve) => {
            if (vlan_conf.length > 0) {
                vlan_conf.forEach((line) => {
                    if (line.match(/^\d/)) {
                        var splitted_line = line.split(/\s+/);
                        var vlan_id = splitted_line[0];
                        var vlan_name = splitted_line[1];
                        if (!this.vlan_ids_to_exclude.includes(vlan_id)) {
                            if (this.vlans.hasOwnProperty(vlan_id)) {
                                if (!this.vlans[vlan_id].includes(vlan_name.toLocaleLowerCase()))
                                    this.vlans[vlan_id].push(vlan_name.toLowerCase());
                            }
                            else {
                                this.vlans[vlan_id] = [vlan_name.toLowerCase()];
                            }
                        }
                    }
                });
                resolve(true);
            }
            else
                resolve(false);
        });
    }
    add_dhcp_snooping_vlan(vlan_id) {
        if (!this.dhcp_snooping_vlans.includes(vlan_id))
            this.dhcp_snooping_vlans.push(vlan_id);
    }
    parse_dhcp_snooping(dhcp_snooping_line) {
        var new_vlans = dhcp_snooping_line.replace("ip dhcp snooping vlan", "").trim().split(",");
        new_vlans.forEach(new_entry => {
            if (new_entry.includes("-")) {
                var start = +new_entry.split("-")[0];
                var stop = +new_entry.split("-")[1];
                for (var vlan_id = start; vlan_id <= stop; vlan_id++)
                    this.add_dhcp_snooping_vlan(vlan_id.toString());
            }
            else
                this.add_dhcp_snooping_vlan(new_entry);
        });
    }
    parse_syslog(syslog_line) {
        var config = syslog_line.replace("logging host", "").trim().split(" ");
        var syslog_ip = config[0];
        var syslog_proto = "udp";
        var syslog_port = "514";
        var transport_index = config.indexOf("transport");
        var port_index = config.indexOf("port");
        if (transport_index > -1)
            syslog_proto = config[syslog_proto + 1];
        if (port_index > -1)
            syslog_port = config[syslog_port + 1];
        var new_syslog = JSON.stringify({
            "host": syslog_ip, "protocol": syslog_proto, "port": syslog_port, "contents": [
                {
                    "facility": "any",
                    "severity": "any"
                }
            ]
        });
        if (!this.syslog.includes(new_syslog))
            this.syslog.push(new_syslog);
    }
    parse_domain(domain_line) {
        var new_domain = domain_line.replace("ip domain name", "").trim();
        if (!this.domain.includes(new_domain))
            this.domain.push(new_domain);
    }
    parse_dns(dns_line) {
        var new_dns = dns_line.replace("ip name-server", "").trim();
        if (!this.dns.includes(new_dns))
            this.dns.push(new_dns);
    }
    parse_ntp(ntp_line) {
        var new_ntp = ntp_line.replace("ntp server", "").trim();
        if (!this.ntp.includes(new_ntp))
            this.ntp.push(new_ntp);
    }
    parse_tacacs(tacas_config) {
        tacas_config.forEach(line => {
            if (line.trim().startsWith("address ipv4")) {
                var config = line.replace("address ipv4", '').trim().split(" ");
                var tacacs_ip = config[0].trim();
                var tacacs_port = "49";
                var port_index = config.indexOf("port");
                if (port_index > -1) {
                    tacacs_port = config[port_index + 1];
                }
                var tmp = JSON.stringify({
                    "host": tacacs_ip,
                    "port": tacacs_port,
                    "secret": "to_be_replaced",
                    "timeout": 10
                });
                if (!this.tacacs.includes(tmp))
                    this.tacacs.push(tmp);
            }
        });
    }
    parse_radius(radius_config) {
        radius_config.forEach(line => {
            if (line.trim().startsWith("address ipv4")) {
                var config = line.replace("address ipv4", '').trim().split(" ");
                var radius_ip = config[0].trim();
                var auth_port_index = config.indexOf("auth-port");
                var acct_port_index = config.indexOf("acct-port");
                if (auth_port_index > -1) {
                    var tmp = JSON.stringify({
                        "port": config[auth_port_index + 1],
                        "host": radius_ip,
                        "secret": "to_be_replaced"
                    });
                    if (!this.radius_auth.includes(tmp))
                        this.radius_auth.push(tmp);
                }
                if (acct_port_index > -1) {
                    var tmp = JSON.stringify({
                        "port": config[acct_port_index + 1],
                        "host": radius_ip,
                        "secret": "to_be_replaced"
                    });
                    if (!this.radius_acct.includes(tmp))
                        this.radius_acct.push(tmp);
                }
            }
        });
    }
    parse_interface(interface_config) {
        var vlan_access = undefined;
        var vlan_trunk_native = undefined;
        var vlan_trunk_allowed = [];
        var all_networks = false;
        var networks = [];
        var voip_network = undefined;
        var disable_autoneg = false;
        var disabled = false;
        var duplex = "auto";
        var speed = "auto";
        var enable_mac_auth = false;
        var enable_qos = false;
        var mac_auth_only = false;
        var mac_limit = 0;
        var mode = "access";
        var mtu = undefined;
        var persist_mac = false;
        var poe_disabled = false;
        var port_auth = undefined;
        var rejected_network = undefined;
        var stp_edge = true;
        var profile_name = "";
        var profile_configuration = {};
        interface_config.forEach(line => {
            if (line.trim().startsWith("description"))
                profile_name = line.replace("description", "").trim().toString();
            else if (line.trim().startsWith("switchport mode"))
                mode = line.replace("switchport mode", "").trim();
            else if (line.trim().startsWith("switchport access vlan"))
                vlan_access = line.replace("switchport access vlan", "").trim();
            else if (line.trim().startsWith("switchport voice vlan"))
                voip_network = line.replace("switchport voice vlan", "").trim();
            else if (line.trim().startsWith("switchport trunk native vlan"))
                vlan_trunk_native = line.replace("switchport trunk native vlan", "").trim();
            else if (line.trim().startsWith("switchport trunk allowed vlan"))
                vlan_trunk_allowed = line.replace("switchport trunk allowed vlan", "").trim().split(",");
            else if (line.trim().startsWith("dot1x pae authenticator"))
                port_auth = "dot1x";
            else if (line.trim().startsWith("mab"))
                enable_mac_auth = true;
            else if (line.trim().startsWith("spanning-tree portfast"))
                stp_edge = true;
            else if (line.trim().startsWith("spanning-tree bpduguard enable"))
                stp_edge = true;
            else if (line.trim().startsWith("auto qos"))
                enable_qos = true;
            else if (line.trim().startsWith("shutdown"))
                disabled = true;
            else if (line.trim().startsWith("power inline never"))
                poe_disabled = true;
            else if (line.trim().startsWith("duplex")) {
                duplex = line.replace("duplex", "").trim();
            }
            else if (line.trim().startsWith("speed")) {
                speed = line.replace("speed", "").trim();
                switch (speed) {
                    case "10":
                        speed = "10m";
                        break;
                    case "100":
                        speed = "100m";
                        break;
                    case "1000":
                        speed = "1g";
                        break;
                    case "2500":
                        speed = "2.5g";
                        break;
                    case "5000":
                        speed = "5g";
                        break;
                    case "10000":
                        speed = "10g";
                        break;
                    default:
                        speed = "auto";
                        disable_autoneg = false;
                        break;
                }
            }
        });
        if (speed != "auto" && duplex != "auto")
            disable_autoneg = true;
        if (enable_mac_auth && port_auth == undefined) {
            port_auth = "dot1x";
            mac_auth_only = true;
        }
        if (mode == "access") {
            if (vlan_access != undefined)
                this.add_vlan(vlan_access);
            else
                vlan_access = "1";
            var port_network = this.get_vlan(vlan_access);
            profile_configuration = {
                "mode": "access",
                "port_network": port_network
            };
        }
        else {
            this.add_vlan(vlan_trunk_native, vlan_trunk_allowed);
            var all_networks = false;
            var port_network = this.get_vlan(vlan_trunk_native);
            var networks = [];
            vlan_trunk_allowed.forEach((vlan_id) => {
                networks.push(this.get_vlan(vlan_id));
            });
            if (vlan_trunk_allowed.length == 0)
                all_networks = true;
            profile_configuration = {
                "mode": "trunk",
                "port_network": port_network,
                "networks": networks,
                "all_networks": all_networks
            };
        }
        profile_configuration["all_networks"] = all_networks;
        profile_configuration["disable_autoneg"] = disable_autoneg;
        profile_configuration["disabled"] = disabled;
        profile_configuration["duplex"] = duplex;
        profile_configuration["speed"] = speed;
        profile_configuration["enable_mac_auth"] = enable_mac_auth;
        profile_configuration["enable_qos"] = enable_qos;
        profile_configuration["mac_auth_only"] = mac_auth_only;
        profile_configuration["mac_limit"] = mac_limit;
        profile_configuration["mode"] = mode;
        profile_configuration["mtu"] = mtu;
        profile_configuration["networks"] = networks;
        profile_configuration["persist_mac"] = persist_mac;
        profile_configuration["poe_disabled"] = poe_disabled;
        profile_configuration["port_auth"] = port_auth;
        profile_configuration["rejected_network"] = rejected_network;
        profile_configuration["stp_edge"] = stp_edge;
        profile_configuration["voip_network"] = voip_network;
        this.add_profile(profile_name, profile_configuration, interface_config);
    }
    add_vlan(vlan = undefined, vlans = undefined) {
        if (vlan && !this.vlans.hasOwnProperty(vlan)) {
            this.vlans[vlan] = [this.vlan_prefix + vlan];
        }
        if (vlans)
            vlans.forEach(vlan => {
                if (vlan && !this.vlans.hasOwnProperty(vlan)) {
                    this.vlans[vlan] = [this.vlan_prefix + vlan];
                }
            });
    }
    get_vlan(vlan_id) {
        if (vlan_id != undefined) {
            try {
                if (this.vlans.hasOwnProperty(vlan_id))
                    return this.vlans[vlan_id][0];
                else {
                    console.error("unable to find vlan name for vlan_id " + vlan_id);
                    console.error(this.vlans);
                }
            }
            catch (_a) {
                console.error("error when trying to get vlan name for vlan_id " + vlan_id);
                console.error(this.vlans);
            }
        }
        else
            return undefined;
    }
    add_profile(profile_name, profile_configuration, interface_config) {
        var str_profile_configuration = JSON.stringify(profile_configuration);
        var index = this.port_profile_configs.indexOf(str_profile_configuration);
        if (!profile_name)
            profile_name = "null";
        if (index < 0) {
            this.ios_config.push(interface_config.join("\r\n"));
            this.port_profile_configs.push(str_profile_configuration);
            this.ios_descriptions.push([profile_name]);
        }
        else {
            if (!this.ios_descriptions[index].includes(profile_name)) {
                this.ios_descriptions[index].push(profile_name);
            }
        }
    }
    generate_profile_names() {
        return __awaiter(this, void 0, void 0, function* () {
            for (var i = 0; i < this.ios_descriptions.length; i++) {
                if (this.ios_descriptions[i].length == 1) {
                    var profile_name = this.ios_descriptions[i][0];
                    if (this.all_port_profile_names.includes(profile_name)) {
                        profile_name = profile_name + "_" + [i];
                    }
                    this.port_profile_names[i] = profile_name.toLowerCase().replace(/\s+/g, "_");
                }
                else {
                    var terms = {};
                    var max_occurence = -1;
                    var description_terms = [];
                    this.ios_descriptions[i].forEach(description => {
                        description.split(" ").forEach(desc_term => {
                            var term = desc_term.toLowerCase().trim().replace("(", "").replace(")", "");
                            if (!["null", "-", ""].includes(term)) {
                                if (!terms.hasOwnProperty(term)) {
                                    terms[term] = 1;
                                }
                                else {
                                    terms[term] += 1;
                                }
                                if (terms[term] > max_occurence)
                                    max_occurence = terms[term];
                            }
                        });
                    });
                    for (let [key, value] of Object.entries(terms)) {
                        if (value == max_occurence) {
                            description_terms.push(key);
                        }
                    }
                    this.port_profile_names[i] = description_terms.join(" ").replace(/\s+/g, "_");
                }
            }
        });
    }
    generate_template() {
        return __awaiter(this, void 0, void 0, function* () {
            this.mist_template = {
                "name": "temporary_name",
                "ntp_servers": this.ntp,
                "dns_servers": this.dns,
                "dns_suffix": this.domain,
                "networks": {},
                "port_usages": {},
                "radius_config": {
                    "acct_interim_interval": 0,
                    "acct_servers": [],
                    "auth_servers": [],
                    "auth_servers_retries": 3,
                    "auth_servers_timeout": 5,
                    "coa_enabled": false,
                    "coa_port": 3799
                },
                "switch_mgmt": {
                    "tacacs": {
                        "enabled": false,
                        "tacplus_servers": []
                    }
                },
                "additional_config_cmds": [],
                "dhcp_snooping": {
                    "enabled": false,
                    "networks": []
                },
                "remote_syslog": {
                    "enabled": false,
                    "servers": []
                }
            };
            for (var vlan_id in this.vlans) {
                if (this.vlans[vlan_id].length > 1)
                    console.warn("WARNING: VLAN " + vlan_id + " has multiple names. Using the first one...");
                this.mist_template["networks"][this.vlans[vlan_id][0]] = { "vlan_id": vlan_id };
            }
            // this.vlans.forEach((vlan_id:string)=>{
            //     this.mist_template["networks"][vlan_prefix+vlan_id] = {"vlan_id": vlan_id};
            // })
            for (var i = 0; i < this.port_profile_names.length; i++) {
                this.mist_template["port_usages"][this.port_profile_names[i]] = JSON.parse(this.port_profile_configs[i]);
            }
            this.radius_auth.forEach((radius_auth) => {
                this.mist_template["radius_config"]["auth_servers"].push(JSON.parse(radius_auth));
            });
            this.radius_acct.forEach((radius_acct) => {
                this.mist_template["radius_config"]["acct_servers"].push(JSON.parse(radius_acct));
            });
            if (this.tacacs.length > 0) {
                this.mist_template["switch_mgmt"]["tacacs"]["enabled"] = true;
                this.tacacs.forEach((tacplus_server) => {
                    this.mist_template["switch_mgmt"]["tacacs"]["tacplus_servers"].push(JSON.parse(tacplus_server));
                });
            }
            if (this.banner.length > 0) {
                this.mist_template["additional_config_cmds"].push("set groups banner system login message \"" + this.banner.replace('"', '\\\"').replace("'", '\\\'') + "\"");
                this.mist_template["additional_config_cmds"].push("set apply-groups banner");
            }
            if (this.dhcp_snooping_vlans.length > 0) {
                this.mist_template["dhcp_snooping"]["enabled"] = true;
                this.dhcp_snooping_vlans.forEach((vlan_id) => {
                    if (this.vlans.hasOwnProperty(vlan_id))
                        this.mist_template["dhcp_snooping"]["networks"].push(this.vlans[vlan_id][0]);
                });
            }
            if (this.syslog.length > 0) {
                this.mist_template["remote_syslog"]["enabled"] = true;
                this.syslog.forEach((syslog) => {
                    this.mist_template["remote_syslog"]["servers"].push(JSON.parse(syslog));
                });
            }
        });
    }
}
exports.IosParser = IosParser;
//# sourceMappingURL=ios_parser.js.map